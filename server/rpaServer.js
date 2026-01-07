/**
 * Servidor Express para ejecutar el RPA de iTraffic
 * Este servidor recibe peticiones del add-in de Outlook y ejecuta el RPA
 * 
 * IMPORTANTE: Asegúrate de que la ruta al RPA sea correcta según tu estructura de carpetas
 */

const express = require('express');
const cors = require('cors');
const { extractReservationData } = require('../services/extractionService');
const masterDataService = require('../services/masterDataService');
const config = require('./config');

const app = express();

// Validar configuración al iniciar (solo en producción)
if (config.isProduction()) {
  try {
    config.validate();
    console.log('✅ Configuración validada correctamente');
  } catch (error) {
    console.error('❌ Error en configuración:', error.message);
    process.exit(1);
  }
}

// Función para importar dinámicamente el RPA (ES modules)
let runRpa;
async function loadRpaService() {
  try {
    // Importar desde la carpeta rpa local del proyecto
    const path = require('path');
    const rpaPath = path.join(__dirname, '..', 'rpa', 'rpaService.js');
    const rpaModule = await import('file:///' + rpaPath.replace(/\\/g, '/'));
    runRpa = rpaModule.runRpa;
    console.log('✅ Módulo RPA cargado exitosamente desde:', rpaPath);
  } catch (error) {
    console.error('❌ Error al cargar módulo RPA:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Middleware
app.use(cors({
  origin: config.corsOrigin,
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
    environment: config.nodeEnv,
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
    
    const { emailContent, userId } = req.body;
    
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
    
    console.log('📋 Datos maestros obtenidos para contexto de IA');
    
    // Extraer datos con IA, pasando los datos maestros como contexto
    const extractedData = await extractReservationData(emailContent, userId || 'outlook-user', masterData);
    
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
  app.listen(config.port, () => {
    console.log(`🚀 Servidor RPA escuchando en puerto ${config.port}`);
    console.log(`🌍 Entorno: ${config.nodeEnv}`);
    console.log(`🔒 CORS habilitado para: ${config.corsOrigin}`);
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

module.exports = app;

