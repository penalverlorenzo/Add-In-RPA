/**
 * Cliente HTTP para comunicarse con el backend RPA
 * Este archivo maneja la comunicación entre el add-in de Outlook y el servidor RPA
 */

// URL del servidor RPA (se configura dinámicamente según el entorno)
// En producción, esta URL se inyecta durante el build de webpack
const RPA_SERVICE_URL = typeof RPA_API_URL !== 'undefined' 
  ? RPA_API_URL + '/api/rpa/create-reservation'
  : 'http://localhost:3001/api/rpa/create-reservation';

/**
 * Transforma los datos del formulario al formato esperado por el RPA
 * @param {Array} pasajeros - Array de objetos con datos de pasajeros
 * @param {Object} datosReserva - Datos de la reserva del formulario
 * @returns {Object} Datos formateados para el RPA
 */
function transformarDatosParaRPA(pasajeros, datosReserva = {}) {
  return {
    passengers: pasajeros.map(p => ({
      lastName: p.apellido || '',
      firstName: p.nombre || '',
      paxType: p.tipoPasajero === 'adulto' ? 'ADU' : p.tipoPasajero === 'menor' ? 'CHD' : 'INF',
      birthDate: formatearFecha(p.fechaNacimiento), // Convertir a MM/DD/AAAA
      nationality: p.nacionalidad?.toUpperCase() || 'ARGENTINA',
      sex: p.sexo === 'masculino' ? 'M' : p.sexo === 'femenino' ? 'F' : 'O',
      documentNumber: p.dni || '',
      documentType: p.tipoDoc?.toUpperCase() || 'DNI',
      cuilCuit: p.cuil || '',
      telefono: p.telefono || '',
      direccion: p.direccion || ''
    })),
    reservationType: datosReserva.tipoReserva || 'AGENCIAS [COAG]',
    status: datosReserva.estadoReserva || 'PENDIENTE DE CONFIRMACION [PC]',
    client: datosReserva.cliente || 'DESPEGAR - TEST - 1',
    travelDate: formatearFecha(datosReserva.fechaViaje) || '12/01/2026',
    seller: datosReserva.vendedor || 'TEST TEST'
  };
}

/**
 * Formatea una fecha de YYYY-MM-DD a MM/DD/YYYY
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @returns {string} Fecha en formato MM/DD/YYYY
 */
function formatearFecha(fecha) {
  if (!fecha) return '';
  
  try {
    const [year, month, day] = fecha.split('-');
    return `${month}/${day}/${year}`;
  } catch (error) {
    return '';
  }
}

/**
 * Envía los datos al servicio RPA para crear la reserva
 * @param {Array} pasajeros - Array de objetos con datos de pasajeros del formulario
 * @param {Object} datosReserva - Datos de la reserva del formulario
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function crearReservaEnITraffic(pasajeros, datosReserva = {}) {
  try {
    // Transformar datos al formato del RPA
    const datosRPA = transformarDatosParaRPA(pasajeros, datosReserva);
    
    // Enviar petición al servidor RPA
    const response = await fetch(RPA_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datosRPA)
    });
    
    if (!response.ok) {
      throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
    }
    
    const resultado = await response.json();
    
    return {
      success: true,
      data: resultado,
      message: 'Reserva creada exitosamente en iTraffic'
    };
    
  } catch (error) {
    // Si el servidor no está disponible, mostrar un mensaje más amigable
    if (error.message.includes('fetch')) {
      throw new Error('No se pudo conectar con el servicio RPA. Asegúrate de que el servidor esté corriendo.');
    }
    
    throw error;
  }
}

/**
 * Verifica si el servicio RPA está disponible
 * @returns {Promise<boolean>} true si el servicio está disponible
 */
export async function verificarServicioRPA() {
  try {
    const healthUrl = typeof RPA_API_URL !== 'undefined'
      ? RPA_API_URL + '/api/rpa/health'
      : 'http://localhost:3001/api/rpa/health';
      
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error verificando servicio RPA:', error);
    return false;
  }
}

