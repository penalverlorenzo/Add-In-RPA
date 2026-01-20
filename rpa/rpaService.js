// rpa/rpaService.js
import { createBrowser, saveSession } from './browser.js';
import { loginITraffic } from './login.js';
import { ensureSession } from './session.js';
import { navigateToDashboard } from './dashboard.js';
import { newReservation } from './newReservation.js';
import { newPassenger } from './newPassenger.js';
import { dataPassenger } from './dataPassenger.js';
import { saveReservation } from './saveReservation.js';
import { addItemToReservation } from './addItemToReservation.js';

/**
 * Ejecuta el RPA de iTraffic
 * @param {Object} reservationData - Datos de la reserva (opcional, usa datos por defecto si no se provee)
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function runRpa(reservationData = null) {
    const { browser, page, context } = await createBrowser();

    try {
        console.log('🚀 Iniciando RPA iTraffic');
        
        if (reservationData) {
            console.log('📋 Datos de reserva recibidos:', JSON.stringify(reservationData, null, 2));
        }

        const hasSession = await ensureSession(page);

        if (!hasSession) {
            // No hay sesión, hacer login
            await loginITraffic(page);
            // Guardar sesión después de login exitoso
            await saveSession(context);
        }

        console.log('📂 Listo para operar en iTraffic');
        
        // PASO 1: Navegar al dashboard y hacer click en "Nueva Reserva"
        await navigateToDashboard(page);
        console.log('✅ Dashboard completado');
        
        // PASO 2: Interactuar con el modal de nueva reserva
        await newReservation(page, reservationData);
        console.log('✅ Modal de nueva reserva completado');
        if (reservationData && reservationData.hotel) {
            let hotel = null;
            
            // Verificar que hotel sea un objeto, no un string
            if (typeof reservationData.hotel === 'string') {
                // Si es "[object Object]", significa que se serializó incorrectamente
                if (reservationData.hotel === '[object Object]') {
                    console.log(`⚠️ Hotel recibido como "[object Object]", intentando obtener de extractedData`);
                    // Intentar obtener el hotel de otra fuente o saltarlo
                    hotel = null;
                } else {
                    // Intentar parsear como JSON válido
                    try {
                        hotel = JSON.parse(reservationData.hotel);
                    } catch (e) {
                        console.log(`⚠️ No se pudo parsear hotel como JSON:`, reservationData.hotel);
                        hotel = null;
                    }
                }
            } else if (typeof reservationData.hotel === 'object' && reservationData.hotel !== null) {
                hotel = reservationData.hotel;
            }
            
            if (hotel && typeof hotel === 'object' && (hotel.tipo_habitacion || hotel.Ciudad || hotel.Categoria || hotel.nombre_hotel)) {
                console.log(`\n🏨 Procesando hotel ${hotel.tipo_habitacion || hotel.Ciudad || hotel.Categoria || hotel.nombre_hotel || 'sin nombre'}`);
                // Pasar los pasajeros para configurar las habitaciones
                const passengers = reservationData.passengers || [];
                console.log(`👤 Pasajeros desde rpaService: ${JSON.stringify(reservationData)}`);
                if (!hotel.in || !hotel.out) {
                    hotel.in = reservationData.services[0]?.in;
                    hotel.out = reservationData.services[0]?.out;
                }
                await addItemToReservation(page, hotel, 'Agregar Hotel', passengers);
                console.log('✅ Hotel guardado');
            } else {
                console.log(`⚠️ Hotel no válido o sin datos suficientes. Tipo: ${typeof reservationData.hotel}, Valor: ${JSON.stringify(reservationData.hotel)}`);
            }
        }
        if (reservationData && reservationData.services && reservationData.services.length > 0) {
            for (let i = 0; i < reservationData.services.length; i++) {
                const service = reservationData.services[i];
                if (reservationData.hotel && reservationData.hotel.tipo_habitacion) {
                    service.tipo_habitacion = reservationData.hotel?.tipo_habitacion;
                }
                console.log(`\n👤 Procesando servicio ${i + 1} de ${reservationData.services.length}`);
                await addItemToReservation(page, service, 'Agregar Servicio', reservationData.passengers || []);
                console.log('✅ Servicio guardado');
            }
        }
        // PASO 3: Procesar cada pasajero
        if (reservationData && reservationData.passengers && reservationData.passengers.length > 0) {
            for (let i = 0; i < reservationData.passengers.length; i++) {
                const passenger = reservationData.passengers[i];
                console.log(`\n👤 Procesando pasajero ${i + 1} de ${reservationData.passengers.length}`);
                
                // Abrir modal de nuevo pasajero
                await newPassenger(page);
                console.log('✅ Modal de nuevo pasajero abierto');
                
                // Llenar datos del pasajero
                await dataPassenger(page, passenger);
                console.log('✅ Datos del pasajero completados');
                
                // Esperar a que el modal se cierre completamente antes del siguiente pasajero
                await page.waitForTimeout(2000);
            }
        } else {
            console.log('⚠️ No se recibieron datos de pasajeros');
        }
        
        await saveReservation(page);
        return {
            success: true,
            message: 'Reserva creada exitosamente',
            timestamp: new Date().toISOString()
        };

    } catch (e) {
        console.error('❌ RPA ERROR:', e.message);
        throw e;
    } finally {
        await browser.close();
        console.log('🧹 Browser cerrado');
    }
}
