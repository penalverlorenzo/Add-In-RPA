/**
 * Servidor Express para ejecutar el RPA de iTraffic
 * Este servidor recibe peticiones del add-in de Outlook y ejecuta el RPA
 * 
 * IMPORTANTE: Asegúrate de que la ruta al RPA sea correcta según tu estructura de carpetas
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { extractReservationData, calculateQualityScore } from '../services/extractionService.js';
import masterDataService from '../services/mysqlMasterDataService.js';
import { updateAgentFiles } from '../services/agentFileService.js';
import { extractUserIdentifier, getOrCreateThread, sendMessageToAssistant } from '../services/assistantChatService.js';
import { sendMessageToAgent, getOrCreateAgentThread } from '../services/agentChatService.js';
import { updateAgentFilesAgents } from '../services/agentFileServiceAgents.js';
import { 
  getAccessToken, 
  createSubscription, 
  renewSubscription, 
  listSubscriptions,
  downloadFileFromOneDrive,
  getFileMetadataByItemId,
  getFileMetadata
} from '../services/microsoftGraphService.js';
import { convertExcelToJson } from '../services/excelToJsonService.js';
import config from '../config/index.js';

// ES Modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configure multer for handling multipart/form-data (in-memory storage for images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max per file
  }
});

// Validar configuración al iniciar (solo en producción)
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const required = [
    { name: 'ITRAFFIC_LOGIN_URL', value: config.itraffic.loginUrl },
    { name: 'ITRAFFIC_USER', value: config.itraffic.user },
    { name: 'ITRAFFIC_PASSWORD', value: config.itraffic.password },
    { name: 'AZURE_OPENAI_API_KEY', value: config.openai.apiKey },
    { name: 'AZURE_OPENAI_ENDPOINT', value: config.openai.endpoint },
    { name: 'MYSQL_HOST', value: config.mysql.host },
    { name: 'MYSQL_USER', value: config.mysql.user },
    { name: 'MYSQL_PASSWORD', value: config.mysql.password },
    { name: 'MYSQL_DATABASE', value: config.mysql.database }
  ];
  
  const missing = required.filter(r => !r.value);
  
  if (missing.length > 0) {
    const missingNames = missing.map(m => m.name).join(', ');
    console.error(`:x: Faltan variables de entorno requeridas: ${missingNames}`);
    process.exit(1);
  }
  
  console.log(':white_check_mark: Configuración validada correctamente');
  console.log(`:bar_chart: MySQL configurado: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
}

// Función para importar dinámicamente el RPA (ES modules)
let runRpa;
async function loadRpaService() {
  try {
    // Importar desde la carpeta rpa local del proyecto
    const rpaPath = path.join(__dirname, '..', 'rpa', 'rpaService.js');
    
    console.log(':arrows_counterclockwise: Intentando cargar módulo RPA desde:', rpaPath);
    const rpaModule = await import('../rpa/rpaService.js');
    runRpa = rpaModule.runRpa;
    console.log(':white_check_mark: Módulo RPA cargado exitosamente');
  } catch (error) {
    console.error(':x: Error al cargar módulo RPA:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Middleware
app.use(cors({
  origin: config.server.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ruta de health check
app.get('/api/rpa/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Servicio RPA disponible',
    environment: process.env.NODE_ENV || 'development',
    rpaLoaded: !!runRpa,
    timestamp: new Date().toISOString()
  });
});

// Ruta para obtener datos maestros
app.get('/api/master-data', async (req, res) => {
  try {
    console.log(':clipboard: Obteniendo datos maestros...');
    
    const [sellers, clients, statuses, reservationTypes, genders, documentTypes, countries] = await Promise.all([
      masterDataService.getAllSellers(),
      masterDataService.getAllClients(),
      masterDataService.getAllStatuses(),
      masterDataService.getAllReservationTypes(),
      masterDataService.getAllGenders(),
      masterDataService.getAllDocumentTypes(),
      masterDataService.getAllCountries()
    ]);
    
    // Transformar para el formato que espera el frontend
    const response = {
      sellers: sellers.map(s => ({
        code: s.code,
        name: s.fullName || s.name || s.code
      })),
      clients: clients.map(c => ({
        code: c.code,
        name: c.displayName || `${c.code} - ${c.name}`
      })),
      statuses: statuses.map(s => ({
        code: s.code,
        name: s.name
      })),
      reservationTypes: reservationTypes.map(r => ({
        code: r.code,
        name: r.name
      })),
      genders: genders.map(g => ({
        code: g.code,
        name: g.name
      })),
      documentTypes: documentTypes.map(d => ({
        code: d.code,
        name: d.name
      })),
      countries: countries.map(c => ({
        code: c.code,
        name: c.name
      }))
    };
    
    console.log(`:white_check_mark: Datos maestros obtenidos: ${sellers.length} vendedores, ${clients.length} clientes, ${countries.length} países`);
    
    res.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error(':x: Error obteniendo datos maestros:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Middleware para detectar si es JSON o FormData
const handleExtractRequest = async (req, res, next) => {
  // Detectar si es multipart/form-data
  const isMultipart = req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data');
  
  if (isMultipart) {
    // Usar multer para procesar FormData
    upload.fields([{ name: 'images', maxCount: 20 }])(req, res, (err) => {
      if (err) {
        console.error(':x: Error procesando FormData:', err.message);
        return res.status(400).json({
          success: false,
          error: `Error procesando FormData: ${err.message}`
        });
      }
      next();
    });
  } else {
    // Para JSON, usar el middleware de express.json() que ya está configurado
    next();
  }
};

// Ruta para extraer datos del email con IA
app.post('/api/extract', handleExtractRequest, async (req, res) => {
  try {
    console.log(':robot_face: Petición recibida para extracción con IA');
    const startTime = Date.now();
    
    // Detectar formato de la petición
    const isMultipart = req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data');
    
    let emailContent, userId, conversationId, isReExtract, images = [];
    
    if (isMultipart) {
      // Formato FormData
      console.log(':package: Formato detectado: multipart/form-data');
      emailContent = req.body.emailContent;
      userId = req.body.userId;
      conversationId = req.body.conversationId;
      isReExtract = req.body.isReExtract;
      
      // Extraer imágenes del campo "images" (puede ser múltiples archivos con el mismo nombre)
      if (req.files && req.files.images) {
        images = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
        console.log(`:camera: Imágenes recibidas: ${images.length}`);
        images.forEach((img, index) => {
          console.log(`   Imagen ${index + 1}: ${img.originalname} (${img.mimetype}, ${img.size} bytes)`);
        });
      } else {
        console.log(':information_source: No se recibieron imágenes en el FormData');
      }
    } else {
      // Formato JSON
      console.log(':package: Formato detectado: application/json');
      emailContent = req.body.emailContent;
      userId = req.body.userId;
      conversationId = req.body.conversationId;
      isReExtract = req.body.isReExtract;
      images = []; // Sin imágenes en JSON
    }
    
    // Convertir isReExtract de string a booleano
    if (typeof isReExtract === 'string') {
      isReExtract = isReExtract.toLowerCase() === 'true';
    }
    let user;
    try {
      user = await masterDataService.getUserById(userId);
      if (!user) {
        user = await masterDataService.getUserByEmail(userId);
      }
    } catch (err) {
      console.error(':x: Database error verifying user:', err.message);
      console.error('   Error details:', err);
      throw new Error(`Database error verifying user: ${err.message}`);
    }

  if (!user) {
    const error = new Error('User not found ' + userId);
    error.status = 404;
    throw error;
  }

  if (!user.isServiceEnabled) {
    const error = new Error('Service not enabled for this user ' + userId);
    error.status = 403;
    throw error;
  }

  console.log(`:white_check_mark: User authorized: ${user.email} ${req?.body?.conversationId || 'no conversation id'}`);
    // Validar que se recibió contenido del email
    if (!emailContent || emailContent.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'El contenido del email es demasiado corto o está vacío'
      });
    }
    
    console.log(`:e-mail: Extrayendo datos del email (${emailContent.length} caracteres)...`);
    const extraction = await masterDataService.getExtractionByConversationId(conversationId);
    
    // Buscar si existe una reserva creada para este conversationId
    const reservation = await masterDataService.getReservationByConversationId(conversationId);
    const doesReservationExist = !!(reservation && reservation.code);
    
    if (extraction && !isReExtract) {
      console.log(':white_check_mark: Extracción encontrada para la conversación:', extraction.id);
      
      if (doesReservationExist) {
        console.log(`:clipboard: Reserva encontrada con código: ${reservation.code}`);
        extraction.reservationCode = reservation.code;
      }
      
      return res.json({
        success: true,
        data: extraction,
        message: 'Extracción encontrada, no se necesita extraer nuevamente',
        didExtractionExist: true,
        doesReservationExist: doesReservationExist
      });
    }
    // Obtener datos maestros para que la IA pueda mapear correctamente
    const [sellers, clients, statuses, reservationTypes, genders, documentTypes, countries] = await Promise.all([
      masterDataService.getAllSellers(),
      masterDataService.getAllClients(),
      masterDataService.getAllStatuses(),
      masterDataService.getAllReservationTypes(),
      masterDataService.getAllGenders(),
      masterDataService.getAllDocumentTypes(),
      masterDataService.getAllCountries()
    ]);
    
    const masterData = {
      sellers: sellers.map(s => s.fullName || s.name || s.code),
      clients: clients.map(c => c.displayName || `${c.code} - ${c.name}`),
      statuses: statuses.map(s => s.name),
      reservationTypes: reservationTypes.map(r => r.name),
      genders: genders.map(g => ({ code: g.code, name: g.name })),
      documentTypes: documentTypes.map(d => ({ code: d.code, name: d.name })),
      countries: countries.map(c => c.name)
    };
    const processingTimeMs = Date.now() - startTime;
    console.log(':clipboard: Datos maestros obtenidos para contexto de IA');
    // Extraer datos con IA, pasando los datos maestros como contexto y las imágenes si están disponibles
    const extractedData = await extractReservationData(emailContent, userId || 'outlook-user', masterData, conversationId, images);
    const qualityScore = calculateQualityScore(extractedData);
    extractedData.qualityScore = qualityScore;
    
    // Save extraction to MySQL database
    await masterDataService.saveExtraction({
      userId,
      userEmail: user.email,
      conversationId,
      extractedData,
      emailContentLength: emailContent.length,
      qualityScore,
      confidence: extractedData.confidence,
      passengersCount: extractedData.passengers?.length || 0,
      extractedAt: new Date().toISOString(),
      processingTimeMs
    });
    
    console.log(':white_check_mark: Extracción completada exitosamente');
    console.log(`   Pasajeros extraídos: ${extractedData.passengers?.length || 0}`);
    
    // Si existe una reserva, agregar el código a los datos extraídos
    let finalDoesReservationExist = doesReservationExist;
    
    if (doesReservationExist) {
      console.log(`:clipboard: Reserva encontrada en BD con código: ${reservation.code}`);
      
      // Verificar que el código sigue siendo válido en iTraffic
      // Solo hacer verificación si estamos en modo producción o si se solicita explícitamente
      // Para evitar sobrecarga, podemos hacer la verificación de forma asíncrona o con flag
      const shouldVerify = process.env.VERIFY_RESERVATION_CODES === 'true' || process.env.NODE_ENV === 'production';
      
      if (shouldVerify) {
        try {
          console.log(`:mag: Verificando validez del código de reserva: ${reservation.code}`);
          // Crear una instancia temporal del browser para verificar el código
          const { createBrowser } = await import('../rpa/browser.js');
          const { loginITraffic } = await import('../rpa/login.js');
          const { ensureSession } = await import('../rpa/session.js');
          const { navigateToDashboard } = await import('../rpa/dashboard.js');
          const { verifyReservationCodeExists } = await import('../rpa/verifyReservationCode.js');
          
          const { browser, page } = await createBrowser();
          
          try {
            // Verificar sesión y navegar al dashboard
            const hasSession = await ensureSession(page);
            if (!hasSession) {
              await loginITraffic(page);
            }
            await navigateToDashboard(page);
            
            // Verificar que el código existe
            const codeExists = await verifyReservationCodeExists(page, reservation.code);
            
            if (!codeExists) {
              console.log(`:x: Código de reserva inválido: ${reservation.code} no existe en iTraffic`);
              // Eliminar el registro inválido de la BD
              await masterDataService.deleteReservationByConversationId(conversationId);
              console.log(`:wastebasket: Registro inválido eliminado de reservations_history`);
              // No agregar reservationCode a extractedData y actualizar doesReservationExist
              extractedData.reservationCode = null;
              finalDoesReservationExist = false;
            } else {
              console.log(`:white_check_mark: Código de reserva verificado: ${reservation.code} es válido`);
              extractedData.reservationCode = reservation.code;
            }
            
            await browser.close();
          } catch (verifyError) {
            await browser.close();
            console.error(':x: Error al verificar código de reserva:', verifyError.message);
            // Si falla la verificación, incluir el código de todas formas (puede ser un problema temporal)
            console.log(':warning: Incluyendo código a pesar del error de verificación');
            extractedData.reservationCode = reservation.code;
          }
        } catch (browserError) {
          console.error(':x: Error al crear browser para verificación:', browserError.message);
          // Si no se puede crear el browser, incluir el código de todas formas
          console.log(':warning: Incluyendo código sin verificación');
          extractedData.reservationCode = reservation.code;
        }
      } else {
        // Si no se debe verificar, incluir el código directamente
        extractedData.reservationCode = reservation.code;
      }
    }
    
    res.json({
      success: true,
      data: extractedData,
      message: 'Datos extraídos exitosamente',
      didExtractionExist: false,
      doesReservationExist: finalDoesReservationExist
    });
    
  } catch (error) {
    console.error(':x: Error en extracción:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Transforma los datos del formulario al formato de extracción original
 * SOBRESCRIBE completamente los datos del usuario, preservando solo metadatos técnicos
 * @param {Object} formData - Datos del formulario (formato del frontend)
 * @param {Object} originalData - Datos originales de la extracción (solo para metadatos)
 * @returns {Object} Datos transformados al formato de extracción
 */
function transformFormDataToExtractionFormat(formData, originalData) {
  // Helper para normalizar valores vacíos a null
  const normalizeValue = (value) => {
    if (value === '' || value === undefined) return null;
    if (Array.isArray(value) && value.length === 0) return [];
    return value;
  };

  // Helper para obtener valor del formulario o null (no preservar originales)
  const getFormValue = (formValue) => {
    return normalizeValue(formValue);
  };

  // Transformar pasajeros - usar directamente los del formulario
  const transformedPassengers = formData.passengers?.map((p) => {
    return {
      firstName: p.nombre || null,
      lastName: p.apellido || null,
      documentType: p.tipoDoc?.toUpperCase() || null,
      documentNumber: p.dni || null,
      nationality: p.nacionalidad?.toUpperCase() || null,
      dateOfBirth: p.fechaNacimiento || null,
      sex: p.sexo?.toUpperCase() || null,
      cuilCuit: p.cuil || null,
      direccion: p.direccion || null,
      passengerType: p.tipoPasajero === 'adulto' ? 'ADU' : p.tipoPasajero === 'menor' ? 'CHD' : p.tipoPasajero === 'infante' ? 'INF' : 'ADU',
      phoneNumber: p.telefono || null
    };
  }) || [];

  // Transformar servicios - usar directamente los del formulario (si viene vacío, será [])
  const transformedServices = formData.services?.map((s) => {
    return {
      destino: s.destino || null,
      in: s.in || null,
      out: s.out || null,
      nts: s.nts || 0,
      basePax: s.basePax || 0,
      servicio: s.servicio || null,
      descripcion: s.descripcion || null,
      estado: s.estado || null
    };
  }) || [];

  // Transformar vuelos - usar directamente los del formulario (si viene vacío, será [])
  const transformedFlights = formData.flights?.map((f) => {
    return {
      flightNumber: f.flightNumber || null,
      airline: f.airline || null,
      origin: f.origin || null,
      destination: f.destination || null,
      departureDate: f.departureDate || null,
      departureTime: f.departureTime || null,
      arrivalDate: f.arrivalDate || null,
      arrivalTime: f.arrivalTime || null
    };
  }) || [];

  // Construir objeto transformado - SOBRESCRIBIR completamente con datos del formulario
  const transformed = {
    // Campos principales - usar valores del formulario directamente
    client: getFormValue(formData.cliente),
    seller: getFormValue(formData.vendedor),
    status: getFormValue(formData.estadoReserva),
    reservationType: getFormValue(formData.tipoReserva),
    travelDate: getFormValue(formData.fechaViaje),
    tourEndDate: getFormValue(formData.tourEndDate),
    reservationDate: getFormValue(formData.reservationDate),
    dueDate: getFormValue(formData.dueDate),
    contact: getFormValue(formData.contact),
    contactEmail: getFormValue(formData.contactEmail),
    contactPhone: getFormValue(formData.contactPhone),
    currency: getFormValue(formData.currency),
    exchangeRate: formData.exchangeRate !== undefined ? formData.exchangeRate : 0,
    commission: formData.commission !== undefined ? formData.commission : 0,
    netAmount: formData.netAmount !== undefined ? formData.netAmount : 0,
    grossAmount: formData.grossAmount !== undefined ? formData.grossAmount : 0,
    tripName: getFormValue(formData.tripName),
    productCode: getFormValue(formData.productCode),
    codigo: getFormValue(formData.codigo),
    estadoDeuda: getFormValue(formData.estadoDeuda),
    reservationCode: getFormValue(formData.reservationCode),
    provider: getFormValue(formData.provider),
    
    // Contadores
    adults: formData.adults !== undefined ? formData.adults : 0,
    children: formData.children !== undefined ? formData.children : 0,
    infants: formData.infants !== undefined ? formData.infants : 0,
    
    // Arrays y objetos - usar directamente del formulario (null o [] si viene así)
    passengers: transformedPassengers,
    services: transformedServices,
    flights: transformedFlights,
    hotel: getFormValue(formData.hotel), // Si viene null, será null (se borra)
    checkIn: getFormValue(formData.checkIn),
    checkOut: getFormValue(formData.checkOut),
    detailType: getFormValue(formData.detailType),
    
    // Metadatos originales (preservar solo estos)
    conversationId: originalData.conversationId,
    userId: originalData.userId,
    modelUsed: originalData.modelUsed,
    emailContentLength: originalData.emailContentLength,
    confidence: originalData.confidence,
    qualityScore: originalData.qualityScore,
    extractedAt: originalData.extractedAt
  };

  return transformed;
}

// Ruta para actualizar extracción
app.post('/api/extract/update', async (req, res) => {
  try {
    console.log(':inbox_tray: Petición recibida para actualizar extracción');
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    // Los datos pueden venir directamente o dentro de req.body.data
    let formData = req.body;
    
    // Si los datos vienen dentro de un objeto con estructura { success, data, message }
    if (req.body.data && typeof req.body.data === 'object' && (req.body.data.passengers || req.body.data.cliente)) {
      console.log(':package: Datos encontrados dentro de req.body.data, extrayendo...');
      formData = req.body.data;
    }
    
    // Validar que se recibió conversationId
    if (!formData.conversationId) {
      return res.status(400).json({
        success: false,
        error: 'conversationId es requerido para actualizar la extracción'
      });
    }
    
    console.log(`:arrows_counterclockwise: Actualizando extracción para conversationId: ${formData.conversationId}`);
    
    // Obtener la extracción original
    const originalExtraction = await masterDataService.getExtractionByConversationId(formData.conversationId);
    
    if (!originalExtraction) {
      return res.status(404).json({
        success: false,
        error: `No se encontró extracción para conversationId: ${formData.conversationId}`
      });
    }
    
    console.log(':clipboard: Extracción original encontrada, transformando datos...');
    
    // Transformar los datos del formulario al formato de extracción
    const transformedData = transformFormDataToExtractionFormat(formData, originalExtraction);
    
    // Limpiar hotel si viene como "[object Object]"
    if (transformedData.hotel && typeof transformedData.hotel === 'string' && transformedData.hotel === '[object Object]') {
      console.log(':warning: Hotel recibido como "[object Object]", eliminando campo inválido');
      transformedData.hotel = null;
    }
    
    // Actualizar la extracción en la base de datos
    const updatedExtraction = await masterDataService.updateExtraction(
      formData.conversationId,
      transformedData
    );
    
    console.log(':white_check_mark: Extracción actualizada exitosamente');
    
    res.json({
      success: true,
      data: {
        conversationId: updatedExtraction.conversationId,
        extractedData: updatedExtraction.data.extractedData || transformedData
      },
      message: 'Extracción actualizada exitosamente'
    });
    
  } catch (error) {
    console.error(':x: Error al actualizar extracción:', error);
    
    const statusCode = error.message && error.message.includes('No extraction found') ? 404 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Ruta para crear reserva
app.post('/api/rpa/create-reservation', async (req, res) => {
  try {
    console.log(':inbox_tray: Petición recibida para crear reserva');
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    // Verificar que el módulo RPA esté cargado
    if (!runRpa) {
      return res.status(503).json({
        success: false,
        error: 'Servicio RPA no disponible. Verifica la configuración del servidor.'
      });
    }
    
    // Los datos pueden venir directamente o dentro de req.body.data (respuesta de /api/extract)
    let reservationData = req.body;
    
    // Si los datos vienen dentro de un objeto con estructura { success, data, message }
    if (req.body.data && typeof req.body.data === 'object' && req.body.data.passengers) {
      console.log(':package: Datos encontrados dentro de req.body.data, extrayendo...');
      reservationData = req.body.data;
    }
    
    // Limpiar hotel si viene como "[object Object]"
    if (reservationData.hotel && typeof reservationData.hotel === 'string' && reservationData.hotel === '[object Object]') {
      console.log(':warning: Hotel recibido como "[object Object]", eliminando campo inválido');
      delete reservationData.hotel;
    }
    
    // Validar que se recibieron datos
    if (!reservationData || !reservationData.passengers || reservationData.passengers.length === 0) {
      console.error(':x: Validación fallida - reservationData:', {
        hasReservationData: !!reservationData,
        hasPassengers: !!(reservationData && reservationData.passengers),
        passengersLength: reservationData?.passengers?.length || 0,
        reqBodyKeys: Object.keys(req.body || {}),
        reqBodyDataKeys: req.body?.data ? Object.keys(req.body.data) : []
      });
      return res.status(400).json({
        success: false,
        error: 'No se recibieron datos de pasajeros'
      });
    }
    
    console.log(':rocket: Ejecutando RPA con los datos recibidos...');
    
    // Agregar userEmail y conversationId si están disponibles en los datos extraídos
    if (reservationData.userEmail) {
      console.log(`:e-mail: User email: ${reservationData.userEmail}`);
    }
    if (reservationData.conversationId) {
      console.log(`:speech_balloon: Conversation ID: ${reservationData.conversationId}`);
    }
    
    // Ejecutar el RPA
    const resultado = await runRpa(reservationData);
    
    console.log(':white_check_mark: RPA ejecutado exitosamente');
    
    // Si no se obtuvo código, agregar advertencia
    if (!resultado.reservationCode) {
      console.log(':warning: Advertencia: No se pudo obtener el código de reserva');
    }
    
    // Actualizar la extracción con los datos usados para crear la reserva
    if (reservationData.conversationId) {
      try {
        console.log(`:arrows_counterclockwise: Actualizando extracción para conversationId: ${reservationData.conversationId}`);
        
        // Obtener la extracción original
        const originalExtraction = await masterDataService.getExtractionByConversationId(reservationData.conversationId);
        
        if (originalExtraction) {
          // Transformar los datos del formulario al formato de extracción si es necesario
          // Si reservationData ya está en formato de extracción, usarlo directamente
          // Si viene en formato de formulario, transformarlo
          let dataToUpdate = reservationData;
          
          // Verificar si viene en formato de formulario (tiene campos como 'cliente', 'vendedor', etc.)
          if (reservationData.cliente || reservationData.vendedor || reservationData.estadoReserva) {
            console.log(':clipboard: Transformando datos del formulario al formato de extracción...');
            dataToUpdate = transformFormDataToExtractionFormat(reservationData, originalExtraction);
          }
          
          // Agregar el código de reserva si se obtuvo
          if (resultado.reservationCode) {
            dataToUpdate.reservationCode = resultado.reservationCode;
            dataToUpdate.codigo = resultado.reservationCode;
          }
          
          await masterDataService.updateExtraction(
            reservationData.conversationId,
            dataToUpdate
          );
          console.log(':white_check_mark: Extracción actualizada exitosamente');
        } else {
          console.log(':warning: No se encontró extracción para actualizar');
        }
      } catch (updateError) {
        console.error(':warning: Error al actualizar extracción (no crítico):', updateError.message);
        // No lanzar error, solo loguear, ya que la reserva ya se creó exitosamente
      }
    }
    
    res.json({
      success: true,
      data: resultado,
      message: 'Reserva creada exitosamente',
      reservationCode: resultado.reservationCode || null
    });
    
  } catch (error) {
    console.error(':x: Error al ejecutar RPA:', error);
    
    // Si es un error de reserva duplicada, retornar 400 (Bad Request) en lugar de 500
    const isDuplicateError = error.message && error.message.includes('Ya existe una Reserva');
    const statusCode = isDuplicateError ? 400 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/rpa/edit-reservation', async (req, res) => {
  try {
    console.log(':inbox_tray: Petición recibida para editar reserva');
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    // Verificar que el módulo RPA esté cargado
    if (!runRpa) {
      return res.status(503).json({
        success: false,
        error: 'Servicio RPA no disponible. Verifica la configuración del servidor.'
      });
    }
    
    // Los datos pueden venir directamente o dentro de req.body.data (respuesta de /api/extract)
    let reservationData = req.body;
    
    // Si los datos vienen dentro de un objeto con estructura { success, data, message }
    if (req.body.data && typeof req.body.data === 'object' && req.body.data.passengers) {
      console.log(':package: Datos encontrados dentro de req.body.data, extrayendo...');
      reservationData = req.body.data;
    }
    
    // Limpiar hotel si viene como "[object Object]"
    if (reservationData.hotel && typeof reservationData.hotel === 'string' && reservationData.hotel === '[object Object]') {
      console.log(':warning: Hotel recibido como "[object Object]", eliminando campo inválido');
      delete reservationData.hotel;
    }
    
    // Validar que se recibieron datos
    if (!reservationData || !reservationData.passengers || reservationData.passengers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se recibieron datos de pasajeros'
      });
    }
    
    // Buscar el código de reserva si no viene en los datos
    // Prioridad: 1) codigo/reservationCode en datos, 2) buscar por conversationId
    let reservationCode = reservationData.codigo || reservationData.reservationCode;
    
    if (!reservationCode) {
      if (reservationData.conversationId) {
        console.log(`:mag: Buscando código de reserva por conversationId: ${reservationData.conversationId}`);
        const reservation = await masterDataService.getReservationByConversationId(reservationData.conversationId);
        if (reservation && reservation.code) {
          console.log(`:white_check_mark: Código de reserva encontrado en BD: ${reservation.code}`);
          reservationCode = reservation.code;
          reservationData.codigo = reservation.code;
        } else {
          console.log(':warning: No se encontró código de reserva para este conversationId');
          return res.status(404).json({
            success: false,
            error: 'No se encontró código de reserva para editar. Asegúrate de haber creado la reserva primero.'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          error: 'Se requiere código de reserva (codigo/reservationCode) o conversationId para editar una reserva'
        });
      }
    }
    
    // Verificar que el código realmente existe en iTraffic antes de intentar editar
    if (reservationCode) {
      console.log(`:mag: Verificando que el código de reserva existe en iTraffic: ${reservationCode}`);
      try {
        // Crear una instancia temporal del browser para verificar el código
        const { createBrowser } = await import('../rpa/browser.js');
        const { loginITraffic } = await import('../rpa/login.js');
        const { ensureSession } = await import('../rpa/session.js');
        const { navigateToDashboard } = await import('../rpa/dashboard.js');
        const { verifyReservationCodeExists } = await import('../rpa/verifyReservationCode.js');
        
        const { browser, page } = await createBrowser();
        
        try {
          // Verificar sesión y navegar al dashboard
          const hasSession = await ensureSession(page);
          if (!hasSession) {
            await loginITraffic(page);
          }
          await navigateToDashboard(page);
          
          // Verificar que el código existe
          const codeExists = await verifyReservationCodeExists(page, reservationCode);
          
          if (!codeExists) {
            console.log(`:x: Código de reserva no existe en iTraffic: ${reservationCode}`);
            // Eliminar el registro inválido de la BD
            if (reservationData.conversationId) {
              await masterDataService.deleteReservationByConversationId(reservationData.conversationId);
              console.log(`:wastebasket: Registro inválido eliminado de reservations_history`);
            }
            
            await browser.close();
            
            return res.status(404).json({
              success: false,
              error: `La reserva con código ${reservationCode} no existe en iTraffic. El registro ha sido limpiado. Por favor, crea una nueva reserva.`
            });
          }
          
          console.log(`:white_check_mark: Código de reserva verificado: ${reservationCode} existe en iTraffic`);
          await browser.close();
        } catch (verifyError) {
          await browser.close();
          console.error(':x: Error al verificar código de reserva:', verifyError.message);
          // Si falla la verificación, continuar de todas formas (puede ser un problema temporal)
          console.log(':warning: Continuando con la edición a pesar del error de verificación');
        }
      } catch (browserError) {
        console.error(':x: Error al crear browser para verificación:', browserError.message);
        // Si no se puede crear el browser, continuar de todas formas
        console.log(':warning: Continuando con la edición sin verificación previa');
      }
    }

    // Obtener datos originales si no vienen en reservationData.originData
    // Los datos originales vienen de la extracción guardada
    if (!reservationData.originData && reservationData.conversationId) {
      console.log(':mag: Obteniendo datos originales de la extracción...');
      const extraction = await masterDataService.getExtractionByConversationId(reservationData.conversationId);
      if (extraction) {
        reservationData.originData = extraction;
        console.log(':white_check_mark: Datos originales obtenidos de la extracción');
      } else {
        console.log(':warning: No se encontraron datos originales, se procesarán todos los campos como nuevos');
      }
    }
    
    console.log(':rocket: Ejecutando RPA para editar reserva con los datos recibidos...');
    
    // Ejecutar el RPA en modo edición
    const resultado = await runRpa(reservationData, true);
    
    console.log(':white_check_mark: RPA ejecutado exitosamente');
    
    // Actualizar la extracción con los datos usados para editar la reserva
    if (reservationData.conversationId) {
      try {
        console.log(`:arrows_counterclockwise: Actualizando extracción para conversationId: ${reservationData.conversationId}`);
        
        // Obtener la extracción original
        const originalExtraction = await masterDataService.getExtractionByConversationId(reservationData.conversationId);
        
        if (originalExtraction) {
          // Transformar los datos del formulario al formato de extracción si es necesario
          // Si reservationData ya está en formato de extracción, usarlo directamente
          // Si viene en formato de formulario, transformarlo
          let dataToUpdate = reservationData;
          
          // Verificar si viene en formato de formulario (tiene campos como 'cliente', 'vendedor', etc.)
          if (reservationData.cliente || reservationData.vendedor || reservationData.estadoReserva) {
            console.log(':clipboard: Transformando datos del formulario al formato de extracción...');
            dataToUpdate = transformFormDataToExtractionFormat(reservationData, originalExtraction);
          }
          
          // Agregar el código de reserva si se obtuvo
          if (resultado.reservationCode) {
            dataToUpdate.reservationCode = resultado.reservationCode;
            dataToUpdate.codigo = resultado.reservationCode;
          }
          
          await masterDataService.updateExtraction(
            reservationData.conversationId,
            dataToUpdate
          );
          console.log(':white_check_mark: Extracción actualizada exitosamente');
        } else {
          console.log(':warning: No se encontró extracción para actualizar');
        }
      } catch (updateError) {
        console.error(':warning: Error al actualizar extracción (no crítico):', updateError.message);
        // No lanzar error, solo loguear, ya que la reserva ya se editó exitosamente
      }
    }
    
    res.json({
      success: true,
      data: resultado,
      message: 'Reserva editada exitosamente'
    });
    
  } catch (error) {
    console.error(':x: Error al ejecutar RPA:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Ruta para actualizar archivos del asistente (Azure OpenAI Assistant)
app.post('/api/assistant/update-assistant-files', async (req, res) => {
  try {
    console.log(':inbox_tray: Petición recibida para actualizar archivos del asistente');
    
    const result = await updateAgentFiles(req.body);

    res.json({
      success: true,
      message: 'Archivos del asistente actualizados exitosamente',
      data: result
    });

  } catch (error) {
    console.error(':x: Error al actualizar archivos del asistente:', error);
    
    // Determine status code based on error type
    const statusCode = error.message.includes('requerido') || error.message.includes('debe ser') ? 400 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Ruta para actualizar archivos del agente (Azure AI Agents)
app.post('/api/agent/update-agent-files', async (req, res) => {
  try {
    console.log(':inbox_tray: Petición recibida para actualizar archivos del agente');
    
    const result = await updateAgentFilesAgents(req.body);

    res.json({
      success: true,
      message: 'Archivos del agente actualizados exitosamente',
      data: result
    });

  } catch (error) {
    console.error(':x: Error al actualizar archivos del agente:', error);
    
    // Determine status code based on error type
    const statusCode = error.message.includes('requerido') || error.message.includes('debe ser') ? 400 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Webhook endpoint for Microsoft Graph OneDrive notifications
// Note: express.json() middleware already parses JSON, so req.body is already an object
app.post('/webhook/onedrive', async (req, res) => {
  try {
    // Handle validation request from Microsoft Graph
    // Microsoft Graph sends validationToken as a query parameter during subscription setup
    const validationToken = req.query.validationToken;
    if (validationToken) {
      console.log('✅ Validation token received from Microsoft Graph');
      // Return validation token as plain text (required by Microsoft Graph)
      return res.status(200).type('text/plain').send(validationToken);
    }

    // Parse notification body
    // req.body is already parsed by express.json() middleware as an object
    let notificationBody = req.body;
    console.log('notificationBody', notificationBody);
    // Validate that body is an object
    if (!notificationBody || typeof notificationBody !== 'object' || Array.isArray(notificationBody)) {
      console.error('❌ Invalid notification body format:', typeof notificationBody);
      console.error('   Body content:', notificationBody);
      return res.status(400).json({ error: 'Invalid notification body format. Expected JSON object.' });
    }

    console.log('📨 OneDrive notification received:', JSON.stringify(notificationBody, null, 2));

    // Verify clientState if provided
    const clientStateSecret = process.env.CLIENT_STATE_SECRET;
    if (clientStateSecret && notificationBody.value) {
      for (const notification of notificationBody.value) {
        if (notification.clientState && notification.clientState !== clientStateSecret) {
          console.warn('⚠️ Client state mismatch, ignoring notification');
          return res.status(200).json({ message: 'Notification ignored due to client state mismatch' });
        }
      }
    }

    // Get expected file info from ONEDRIVE_RESOURCE for filtering
    // Extract filename and folder path from ONEDRIVE_RESOURCE
    const onedriveResource = process.env.ONEDRIVE_RESOURCE;
    let expectedFileName = null;
    let expectedFolderPath = null;
    
    if (onedriveResource) {
      try {
        const metadata = await getFileMetadata();
        expectedFileName = metadata.name;
        // Extract folder path from parentReference.path or name
        if (metadata.parentReference && metadata.parentReference.path) {
          // parentReference.path format: /drive/root:/Tarifario - Test
          const pathMatch = metadata.parentReference.path.match(/root:(.+)$/);
          if (pathMatch) {
            expectedFolderPath = pathMatch[1].trim();
          }
        }
        console.log(`📋 Expected file: ${expectedFileName}`);
        if (expectedFolderPath) {
          console.log(`📋 Expected folder path: ${expectedFolderPath}`);
        }
      } catch (error) {
        console.warn('⚠️ Could not get expected file info, will process all notifications:', error.message);
      }
    }

    // Process each notification
    if (notificationBody.value && Array.isArray(notificationBody.value)) {
      for (const notification of notificationBody.value) {
        try {
          // Get resourceData from notification (contains item ID and drive ID)
          const resourceData = notification.resourceData;
          if (!resourceData || !resourceData.id) {
            console.warn('⚠️ Notification missing resourceData.id field');
            continue;
          }

          // Extract driveId from resource path (format: drives/{driveId}/root)
          const resource = notification.resource;
          if (!resource) {
            console.warn('⚠️ Notification missing resource field');
            continue;
          }

          const driveMatch = resource.match(/drives\/([^/]+)\/root/);
          if (!driveMatch) {
            console.warn(`⚠️ Could not extract driveId from resource: ${resource}`);
            continue;
          }

          const driveId = driveMatch[1];
          const itemId = resourceData.id;

          console.log(`📥 Processing notification for item: ${itemId} in drive: ${driveId}`);

          // Get file metadata to validate it's the correct file
          const fileMetadata = await getFileMetadataByItemId(driveId, itemId);
          
          // Filter: Only process if it's the expected file
          if (expectedFileName && fileMetadata.name !== expectedFileName) {
            console.log(`⏭️ Skipping file "${fileMetadata.name}" (expected: "${expectedFileName}")`);
            continue;
          }

          // Filter: Check if folder path matches (if expected)
          if (expectedFolderPath && fileMetadata.parentReference && fileMetadata.parentReference.path) {
            const parentPath = fileMetadata.parentReference.path;
            if (!parentPath.includes(expectedFolderPath)) {
              console.log(`⏭️ Skipping file in path "${parentPath}" (expected folder: "${expectedFolderPath}")`);
              continue;
            }
          }

          console.log(`✅ File matches filter criteria: ${fileMetadata.name}`);

          // Download the file from OneDrive using the item ID
          const accessToken = await getAccessToken();
          const downloadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
          
          const downloadResponse = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            throw new Error(`Failed to download file: ${downloadResponse.status} ${errorText}`);
          }

          const arrayBuffer = await downloadResponse.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          console.log(`✅ File downloaded: ${fileMetadata.name} (${fileBuffer.length} bytes)`);
          
          // Convert Excel to JSON
          const jsonData = await convertExcelToJson(fileBuffer);
          
          // Process the JSON data through the existing flow
          console.log('🔄 Processing JSON data through agent files update...');
          const result = await updateAgentFilesAgents(jsonData);
          
          console.log('✅ File processed successfully:', {
            fileName: fileMetadata.name,
            itemId,
            driveId,
            hotels: jsonData.Hoteles.length,
            services: jsonData.Servicios.length,
            packages: jsonData.Paquetes.length,
            result
          });
        } catch (error) {
          console.error('❌ Error processing notification:', error.message);
          // Continue processing other notifications even if one fails
        }
      }
    }

    // Always return 202 Accepted to acknowledge receipt
    res.status(202).json({ message: 'Notification received and processed' });
  } catch (error) {
    console.error('❌ Error in webhook endpoint:', error.message);
    // Still return 202 to prevent retries for unexpected errors
    res.status(202).json({ error: error.message });
  }
});

/**
 * Initializes Microsoft Graph subscription on server startup
 * This should be called after the server starts listening
 */
export async function initializeOneDriveSubscription() {
  try {
    const webhookUrl = process.env.WEBHOOK_URL;
    const onedriveResource = process.env.ONEDRIVE_RESOURCE;
    const clientStateSecret = process.env.CLIENT_STATE_SECRET;

    if (!webhookUrl || !onedriveResource) {
      console.warn('⚠️ WEBHOOK_URL or ONEDRIVE_RESOURCE not configured, skipping subscription initialization');
      return;
    }

    console.log('🔔 Initializing OneDrive subscription...');
    console.log(`   Webhook URL: ${webhookUrl}`);
    console.log(`   OneDrive Resource: ${onedriveResource}`);

    // Get drive root resource path (drives/{driveId}/root)
    // Subscriptions MUST use drives/{driveId}/root, not individual files
    const { getDriveRootResource } = await import('../services/microsoftGraphService.js');
    const expectedResourcePath = await getDriveRootResource();
    console.log(`   Expected subscription resource: ${expectedResourcePath}`);

    // Check for existing subscriptions
    const existingSubscriptions = await listSubscriptions();
    
    // Check if subscription already exists for this resource and webhook URL
    const existingSubscription = existingSubscriptions.find(sub => 
      sub.resource === expectedResourcePath && 
      sub.notificationUrl === webhookUrl
    );

    if (existingSubscription) {
      console.log(`✅ Existing subscription found: ${existingSubscription.id}`);
      
      // Check if subscription is expiring soon (within 24 hours)
      const expirationDate = new Date(existingSubscription.expirationDateTime);
      const now = new Date();
      const hoursUntilExpiration = (expirationDate - now) / (1000 * 60 * 60);
      
      if (hoursUntilExpiration < 24) {
        console.log('🔄 Renewing subscription (expiring soon)...');
        await renewSubscription(existingSubscription.id);
      } else {
        console.log(`ℹ️ Subscription is valid until ${expirationDate.toISOString()}`);
      }
    } else {
      // Create new subscription
      console.log('📝 Creating new subscription...');
      const subscription = await createSubscription(webhookUrl, clientStateSecret);
      console.log(`✅ Subscription created: ${subscription.id}`);
    }

    // Set up automatic renewal check (every 12 hours)
    setInterval(async () => {
      try {
        const subscriptions = await listSubscriptions();
        for (const sub of subscriptions) {
          const expirationDate = new Date(sub.expirationDateTime);
          const now = new Date();
          const hoursUntilExpiration = (expirationDate - now) / (1000 * 60 * 60);
          
          // Renew if expiring within 24 hours
          if (hoursUntilExpiration < 24) {
            console.log(`🔄 Auto-renewing subscription ${sub.id}...`);
            await renewSubscription(sub.id);
          }
        }
      } catch (error) {
        console.error('❌ Error in automatic subscription renewal:', error.message);
      }
    }, 12 * 60 * 60 * 1000); // 12 hours

    console.log('✅ OneDrive subscription initialized and auto-renewal scheduled');
  } catch (error) {
    console.error('❌ Error initializing OneDrive subscription:', error.message);
    // Don't throw - allow server to start even if subscription fails
  }
}

// Configuración del Bot Framework Adapter para Teams
let botAdapter = null;
function initializeBotAdapter() {
  if (!botAdapter) {
    const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: process.env.MICROSOFT_APP_ID,
      MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
      MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID,
      MicrosoftAppType: 'SingleTenant'
    });

    botAdapter = new CloudAdapter(botFrameworkAuthentication);

    // Manejo de errores del adapter
    botAdapter.onTurnError = async (context, error) => {
      console.error('[onTurnError] Error:', error);
      console.error(error);
      await context.sendActivity('Ocurrió un error. Por favor, intenta de nuevo.');
    };
  }
  return botAdapter;
}

// Ruta para mensajes del bot de Teams (chat con asistente)
app.post('/api/messages', async (req, res) => {
  const adapter = initializeBotAdapter();
  
  await adapter.process(req, res, async (context) => {
    try {
      // Solo procesar mensajes de texto
      if (context.activity.type !== 'message' || !context.activity.text) {
        return;
      }

      console.log(':envelope_with_arrow: Mensaje recibido del bot de Teams');
      const userMessage = context.activity.text;
      console.log(`:speech_balloon: Mensaje del usuario: "${userMessage}"`);

      // Enviar indicador de "escribiendo..." para que el usuario sepa que el mensaje se recibió
      await context.sendActivity({ type: 'typing' });

      // Extraer identificador del usuario
      let userId;
      try {
        userId = extractUserIdentifier(context.activity);
        console.log(`:bust_in_silhouette: Usuario identificado: ${userId}`);
      } catch (error) {
        console.error(':x: Error extrayendo identificador de usuario:', error.message);
        await context.sendActivity('No se pudo identificar al usuario. Por favor, intenta de nuevo.');
        return;
      }

      // Obtener o crear thread para el usuario
      let threadId;
      try {
        threadId = await getOrCreateThread(userId);
        console.log(`:thread: Thread ID: ${threadId}`);
      } catch (error) {
        console.error(':x: Error obteniendo/creando thread:', error.message);
        await context.sendActivity('Hubo un problema al iniciar la conversación. Por favor, intenta de nuevo más tarde.');
        return;
      }

      // Enviar mensaje al asistente y obtener respuesta
      let assistantResponse;
      try {
        assistantResponse = await sendMessageToAssistant(userMessage, threadId);
      } catch (error) {
        console.error(':x: Error enviando mensaje al asistente:', error.message);
        await context.sendActivity('Hubo un problema al procesar tu mensaje. Por favor, intenta de nuevo más tarde.');
        return;
      }

      // Enviar respuesta usando el contexto del adapter
      await context.sendActivity(assistantResponse);

    } catch (error) {
      console.error(':x: Error no manejado en /api/messages:', error);
      await context.sendActivity('Ocurrió un error inesperado. Por favor, intenta de nuevo más tarde.');
    }
  });
});

// Ruta para test del agente con manejo de threads y adapter
app.post('/api/messages/agent', async (req, res) => {
  const adapter = initializeBotAdapter();
  
  await adapter.process(req, res, async (context) => {
    try {
      // Solo procesar mensajes de texto
      if (context.activity.type !== 'message' || !context.activity.text) {
        return;
      }

      console.log(':envelope_with_arrow: Mensaje recibido para test del agente');
      const userMessage = context.activity.text;
      console.log(`:speech_balloon: Mensaje del usuario: "${userMessage}"`);

      // Enviar indicador de "escribiendo..." para que el usuario sepa que el mensaje se recibió
      await context.sendActivity({ type: 'typing' });

      // Extraer identificador del usuario
      let userId;
      try {
        userId = extractUserIdentifier(context.activity);
        console.log(`:bust_in_silhouette: Usuario identificado: ${userId}`);
      } catch (error) {
        console.error(':x: Error extrayendo identificador de usuario:', error.message);
        await context.sendActivity('No se pudo identificar al usuario. Por favor, intenta de nuevo.');
        return;
      }

      // Obtener o crear thread para el usuario usando AgentsClient
      let threadId;
      try {
        threadId = await getOrCreateAgentThread(userId);
        console.log(`:thread: Thread ID: ${threadId}`);
      } catch (error) {
        console.error(':x: Error obteniendo/creando thread:', error.message);
        await context.sendActivity('Hubo un problema al iniciar la conversación. Por favor, intenta de nuevo más tarde.');
        return;
      }

      // Enviar mensaje al agente y obtener respuesta
      let agentResponse;
      try {
        const agentId = config.agent.agentId;
        agentResponse = await sendMessageToAgent(userMessage, agentId, threadId);
      } catch (error) {
        console.error(':x: Error enviando mensaje al agente:', error.message);
        await context.sendActivity('Hubo un problema al procesar tu mensaje. Por favor, intenta de nuevo más tarde.');
        return;
      }

      // Enviar respuesta usando el contexto del adapter
      await context.sendActivity(agentResponse);

    } catch (error) {
      console.error(':x: Error no manejado en /test-agent:', error);
      await context.sendActivity('Ocurrió un error inesperado. Por favor, intenta de nuevo más tarde.');
    }
  });
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('Error no manejado:', error);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Cargar el módulo RPA e iniciar servidor
loadRpaService().then(() => {
  app.listen(config.server.port, () => {
    console.log(`:rocket: Servidor RPA escuchando en puerto ${config.server.port}`);
    console.log(`:earth_africa: Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`:lock: CORS habilitado para: ${config.server.corsOrigin}`);
    console.log(`:satellite_antenna: Endpoints disponibles:`);
    console.log(`   - GET  /api/rpa/health`);
    console.log(`   - GET  /api/master-data`);
    console.log(`   - POST /api/extract`);
    console.log(`   - POST /api/extract/update`);
    console.log(`   - POST /api/rpa/create-reservation`);
    console.log(`   - POST /api/rpa/edit-reservation`);
    console.log(`   - POST /api/assistant/update-assistant-files`);
    console.log(`   - POST /api/agent/update-agent-files`);
    console.log(`   - POST /api/messages`);
    console.log(`   - POST /api/messages/agent`);
    console.log(`   - POST /webhook/onedrive`);
    
    // Initialize OneDrive subscription after server starts
    initializeOneDriveSubscription().catch(error => {
      console.error('❌ Error initializing OneDrive subscription:', error.message);
    });
  });
}).catch(error => {
  console.error(':x: Error al iniciar servidor:', error);
  process.exit(1);
});

export default app;
