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
import { extractReservationData, calculateQualityScore } from '../services/extractionService.js';
import masterDataService from '../services/mysqlMasterDataService.js';
import config from '../config/index.js';

// ES Modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

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
    console.error(`❌ Faltan variables de entorno requeridas: ${missingNames}`);
    process.exit(1);
  }
  
  console.log('✅ Configuración validada correctamente');
  console.log(`📊 MySQL configurado: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
}

// Función para importar dinámicamente el RPA (ES modules)
let runRpa;
async function loadRpaService() {
  try {
    // Importar desde la carpeta rpa local del proyecto
    const rpaPath = path.join(__dirname, '..', 'rpa', 'rpaService.js');
    
    console.log('🔄 Intentando cargar módulo RPA desde:', rpaPath);
    const rpaModule = await import('../rpa/rpaService.js');
    runRpa = rpaModule.runRpa;
    console.log('✅ Módulo RPA cargado exitosamente');
  } catch (error) {
    console.error('❌ Error al cargar módulo RPA:', error.message);
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
    console.log('📋 Obteniendo datos maestros...');
    
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
    
    console.log(`✅ Datos maestros obtenidos: ${sellers.length} vendedores, ${clients.length} clientes, ${countries.length} países`);
    
    res.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo datos maestros:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ruta para extraer datos del email con IA
app.post('/api/extract', async (req, res) => {
  try {
    console.log('🤖 Petición recibida para extracción con IA');
    const startTime = Date.now();
    const { emailContent, userId, conversationId, isReExtract } = req.body;
    let user;
    try {
      user = await masterDataService.getUserById(userId);
      if (!user) {
        user = await masterDataService.getUserByEmail(userId);
      }
    } catch (err) {
      console.error('❌ Database error verifying user:', err.message);
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

  console.log(`✅ User authorized: ${user.email} ${req?.body?.conversationId || 'no conversation id'}`);
    // Validar que se recibió contenido del email
    if (!emailContent || emailContent.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'El contenido del email es demasiado corto o está vacío'
      });
    }
    
    console.log(`📧 Extrayendo datos del email (${emailContent.length} caracteres)...`);
    const extraction = await masterDataService.getExtractionByConversationId(conversationId);
    
    // Buscar si existe una reserva creada para este conversationId
    const reservation = await masterDataService.getReservationByConversationId(conversationId);
    const doesReservationExist = !!(reservation && reservation.code);
    
    if (extraction && !isReExtract) {
      console.log('✅ Extracción encontrada para la conversación:', extraction.id);
      
      if (doesReservationExist) {
        console.log(`📋 Reserva encontrada con código: ${reservation.code}`);
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
    console.log('📋 Datos maestros obtenidos para contexto de IA');
    // Extraer datos con IA, pasando los datos maestros como contexto
    const extractedData = await extractReservationData(emailContent, userId || 'outlook-user', masterData, conversationId);
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
    
    console.log('✅ Extracción completada exitosamente');
    console.log(`   Pasajeros extraídos: ${extractedData.passengers?.length || 0}`);
    
    // Si existe una reserva, agregar el código a los datos extraídos
    let finalDoesReservationExist = doesReservationExist;
    
    if (doesReservationExist) {
      console.log(`📋 Reserva encontrada en BD con código: ${reservation.code}`);
      
      // Verificar que el código sigue siendo válido en iTraffic
      // Solo hacer verificación si estamos en modo producción o si se solicita explícitamente
      // Para evitar sobrecarga, podemos hacer la verificación de forma asíncrona o con flag
      const shouldVerify = process.env.VERIFY_RESERVATION_CODES === 'true' || process.env.NODE_ENV === 'production';
      
      if (shouldVerify) {
        try {
          console.log(`🔍 Verificando validez del código de reserva: ${reservation.code}`);
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
              console.log(`❌ Código de reserva inválido: ${reservation.code} no existe en iTraffic`);
              // Eliminar el registro inválido de la BD
              await masterDataService.deleteReservationByConversationId(conversationId);
              console.log(`🗑️ Registro inválido eliminado de reservations_history`);
              // No agregar reservationCode a extractedData y actualizar doesReservationExist
              extractedData.reservationCode = null;
              finalDoesReservationExist = false;
            } else {
              console.log(`✅ Código de reserva verificado: ${reservation.code} es válido`);
              extractedData.reservationCode = reservation.code;
            }
            
            await browser.close();
          } catch (verifyError) {
            await browser.close();
            console.error('❌ Error al verificar código de reserva:', verifyError.message);
            // Si falla la verificación, incluir el código de todas formas (puede ser un problema temporal)
            console.log('⚠️ Incluyendo código a pesar del error de verificación');
            extractedData.reservationCode = reservation.code;
          }
        } catch (browserError) {
          console.error('❌ Error al crear browser para verificación:', browserError.message);
          // Si no se puede crear el browser, incluir el código de todas formas
          console.log('⚠️ Incluyendo código sin verificación');
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
    console.error('❌ Error en extracción:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Ruta para crear reserva
app.post('/api/rpa/create-reservation', async (req, res) => {
  try {
    console.log('📥 Petición recibida para crear reserva');
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
      console.log('📦 Datos encontrados dentro de req.body.data, extrayendo...');
      reservationData = req.body.data;
    }
    
    // Limpiar hotel si viene como "[object Object]"
    if (reservationData.hotel && typeof reservationData.hotel === 'string' && reservationData.hotel === '[object Object]') {
      console.log('⚠️ Hotel recibido como "[object Object]", eliminando campo inválido');
      delete reservationData.hotel;
    }
    
    // Validar que se recibieron datos
    if (!reservationData || !reservationData.passengers || reservationData.passengers.length === 0) {
      console.error('❌ Validación fallida - reservationData:', {
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
    
    console.log('🚀 Ejecutando RPA con los datos recibidos...');
    
    // Agregar userEmail y conversationId si están disponibles en los datos extraídos
    if (reservationData.userEmail) {
      console.log(`📧 User email: ${reservationData.userEmail}`);
    }
    if (reservationData.conversationId) {
      console.log(`💬 Conversation ID: ${reservationData.conversationId}`);
    }
    
    // Ejecutar el RPA
    const resultado = await runRpa(reservationData);
    
    console.log('✅ RPA ejecutado exitosamente');
    
    // Si no se obtuvo código, agregar advertencia
    if (!resultado.reservationCode) {
      console.log('⚠️ Advertencia: No se pudo obtener el código de reserva');
    }
    
    res.json({
      success: true,
      data: resultado,
      message: 'Reserva creada exitosamente',
      reservationCode: resultado.reservationCode || null
    });
    
  } catch (error) {
    console.error('❌ Error al ejecutar RPA:', error);
    
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
    console.log('📥 Petición recibida para editar reserva');
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
      console.log('📦 Datos encontrados dentro de req.body.data, extrayendo...');
      reservationData = req.body.data;
    }
    
    // Limpiar hotel si viene como "[object Object]"
    if (reservationData.hotel && typeof reservationData.hotel === 'string' && reservationData.hotel === '[object Object]') {
      console.log('⚠️ Hotel recibido como "[object Object]", eliminando campo inválido');
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
        console.log(`🔍 Buscando código de reserva por conversationId: ${reservationData.conversationId}`);
        const reservation = await masterDataService.getReservationByConversationId(reservationData.conversationId);
        if (reservation && reservation.code) {
          console.log(`✅ Código de reserva encontrado en BD: ${reservation.code}`);
          reservationCode = reservation.code;
          reservationData.codigo = reservation.code;
        } else {
          console.log('⚠️ No se encontró código de reserva para este conversationId');
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
      console.log(`🔍 Verificando que el código de reserva existe en iTraffic: ${reservationCode}`);
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
            console.log(`❌ Código de reserva no existe en iTraffic: ${reservationCode}`);
            // Eliminar el registro inválido de la BD
            if (reservationData.conversationId) {
              await masterDataService.deleteReservationByConversationId(reservationData.conversationId);
              console.log(`🗑️ Registro inválido eliminado de reservations_history`);
            }
            
            await browser.close();
            
            return res.status(404).json({
              success: false,
              error: `La reserva con código ${reservationCode} no existe en iTraffic. El registro ha sido limpiado. Por favor, crea una nueva reserva.`
            });
          }
          
          console.log(`✅ Código de reserva verificado: ${reservationCode} existe en iTraffic`);
          await browser.close();
        } catch (verifyError) {
          await browser.close();
          console.error('❌ Error al verificar código de reserva:', verifyError.message);
          // Si falla la verificación, continuar de todas formas (puede ser un problema temporal)
          console.log('⚠️ Continuando con la edición a pesar del error de verificación');
        }
      } catch (browserError) {
        console.error('❌ Error al crear browser para verificación:', browserError.message);
        // Si no se puede crear el browser, continuar de todas formas
        console.log('⚠️ Continuando con la edición sin verificación previa');
      }
    }

    // Obtener datos originales si no vienen en reservationData.originData
    // Los datos originales vienen de la extracción guardada
    if (!reservationData.originData && reservationData.conversationId) {
      console.log('🔍 Obteniendo datos originales de la extracción...');
      const extraction = await masterDataService.getExtractionByConversationId(reservationData.conversationId);
      if (extraction) {
        reservationData.originData = extraction;
        console.log('✅ Datos originales obtenidos de la extracción');
      } else {
        console.log('⚠️ No se encontraron datos originales, se procesarán todos los campos como nuevos');
      }
    }
    
    console.log('🚀 Ejecutando RPA para editar reserva con los datos recibidos...');
    
    // Ejecutar el RPA en modo edición
    const resultado = await runRpa(reservationData, true);
    
    console.log('✅ RPA ejecutado exitosamente');
    
    res.json({
      success: true,
      data: resultado,
      message: 'Reserva creada exitosamente'
    });
    
  } catch (error) {
    console.error('❌ Error al ejecutar RPA:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
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
    console.log(`🚀 Servidor RPA escuchando en puerto ${config.server.port}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS habilitado para: ${config.server.corsOrigin}`);
    console.log(`📡 Endpoints disponibles:`);
    console.log(`   - GET  /api/rpa/health`);
    console.log(`   - GET  /api/master-data`);
    console.log(`   - POST /api/extract`);
    console.log(`   - POST /api/rpa/create-reservation`);
  });
}).catch(error => {
  console.error('❌ Error al iniciar servidor:', error);
  process.exit(1);
});

export default app;
