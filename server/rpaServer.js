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
import masterDataService from '../services/masterDataService.js';
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
    { name: 'COSMOS_DB_ENDPOINT', value: config.cosmosDb.endpoint },
    { name: 'COSMOS_DB_KEY', value: config.cosmosDb.key }
  ];
  
  const missing = required.filter(r => !r.value);
  
  if (missing.length > 0) {
    const missingNames = missing.map(m => m.name).join(', ');
    console.error(`❌ Faltan variables de entorno requeridas: ${missingNames}`);
    process.exit(1);
  }
  
  console.log('✅ Configuración validada correctamente');
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
    const { emailContent, userId } = req.body;
    let user;
  try {
    user = await masterDataService.getUserById(userId);
    if (!user) {
      user = await masterDataService.getUserByEmail(userId);
    }
  } catch (err) {
    throw new Error('Database error verifying user');
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

  logger.log(`✅ User authorized: ${user.email}`);
    // Validar que se recibió contenido del email
    if (!emailContent || emailContent.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'El contenido del email es demasiado corto o está vacío'
      });
    }
    
    console.log(`📧 Extrayendo datos del email (${emailContent.length} caracteres)...`);
    
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
    const extractedData = await extractReservationData(emailContent, userId || 'outlook-user', masterData);
    const qualityScore = calculateQualityScore(extractedData);
    extractedData.qualityScore = qualityScore;
    await masterDataService.saveExtraction({
      id: `extraction-${userId}-${Date.now()}`,
      userId,
      userEmail: user.email,
      conversationId: conversationId || null,
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
    
    res.json({
      success: true,
      data: extractedData,
      message: 'Datos extraídos exitosamente'
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
    
    const reservationData = req.body;
    
    // Validar que se recibieron datos
    if (!reservationData || !reservationData.passengers || reservationData.passengers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se recibieron datos de pasajeros'
      });
    }
    
    console.log('🚀 Ejecutando RPA con los datos recibidos...');
    
    // Ejecutar el RPA
    const resultado = await runRpa(reservationData);
    
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
