// rpa/rpaService.js
import { createBrowser, saveSession } from './browser.js';
import { loginITraffic } from './login.js';
import { ensureSession } from './session.js';
import { navigateToDashboard } from './dashboard.js';
import { newReservation } from './newReservation.js';
import { editReservation } from './editReservation.js';
import { newPassenger } from './newPassenger.js';
import { dataPassenger } from './dataPassenger.js';
import { saveReservation } from './saveReservation.js';
import { getReservationCode } from './getReservationCode.js';
import { addItemToReservation } from './addItemToReservation.js';
import { compareReservationData, getChangedPassengers } from './helpers/compareReservationData.js';
import { clearServicesAndHotels, clearPassengers } from './clearReservationItems.js';

/**
 * Ejecuta el RPA de iTraffic
 * @param {Object} reservationData - Datos de la reserva (opcional, usa datos por defecto si no se provee)
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function runRpa(reservationData = null, isEdit = false) {
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
        
        // PASO 2: Interactuar con el modal de nueva reserva o editar
        if (isEdit) {
            // Modo edición: abrir la reserva existente
            await editReservation(page, reservationData);
            console.log('✅ Reserva abierta para edición');
            
            // Obtener datos originales para comparación
            const originData = reservationData?.originData || null;
            const changes = originData ? compareReservationData(reservationData, originData) : null;
            
            // Limpiar servicios/hoteles si hay cambios (antes de agregar nuevos)
            if (changes && (changes.hotel || changes.services)) {
                console.log('🧹 Limpiando servicios y hoteles existentes antes de agregar nuevos...');
                await clearServicesAndHotels(page);
            } else if (!originData) {
                // Si no hay datos originales pero estamos en modo edición, limpiar de todas formas
                console.log('🧹 Limpiando servicios y hoteles existentes (no hay datos originales para comparar)...');
                await clearServicesAndHotels(page);
            }
            
            // Llenar datos de reserva solo si hay cambios en los campos principales
            if (changes && (changes.reservationType || changes.status || changes.client || changes.travelDate || changes.seller)) {
                const { dataReservation } = await import('./dataReservation.js');
                await dataReservation(page, reservationData, originData);
            } else {
                console.log('⏭️  Saltando llenado de datos de reserva (sin cambios)');
            }
        } else {
            // Modo nueva reserva: newReservation ya llama a dataReservation internamente
            await newReservation(page, reservationData);
            console.log('✅ Modal de nueva reserva completado');
        }
        
        // Obtener datos originales para comparación (para uso en hotel, servicios, pasajeros)
        const originData = reservationData?.originData || null;
        const changes = originData ? compareReservationData(reservationData, originData) : null;
        // Procesar hotel solo si es nuevo o si cambió
        if (reservationData && reservationData.hotel && (!isEdit || changes?.hotel)) {
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
        } else if (isEdit && !changes?.hotel) {
            console.log('⏭️  Saltando hotel (sin cambios)');
        }
        // Procesar servicios solo si es nuevo o si cambiaron
        if (reservationData && reservationData.services && reservationData.services.length > 0 && (!isEdit || changes?.services)) {
            for (let i = 0; i < reservationData.services.length; i++) {
                const service = reservationData.services[i];
                if (reservationData.hotel && reservationData.hotel.tipo_habitacion) {
                    service.tipo_habitacion = reservationData.hotel?.tipo_habitacion;
                }else {
                    service.tipo_habitacion = "SGL";
                }
                console.log(`\n👤 Procesando servicio ${i + 1} de ${reservationData.services.length}`);
                await addItemToReservation(page, service, 'Agregar Servicio', reservationData.passengers || []);
                console.log('✅ Servicio guardado');
            }
        } else if (isEdit && !changes?.services) {
            console.log('⏭️  Saltando servicios (sin cambios)');
        }
        // PASO 3: Procesar solo pasajeros que cambiaron o son nuevos
        if (reservationData && reservationData.passengers && reservationData.passengers.length > 0) {
            let passengersToProcess = reservationData.passengers;
            
            // Si es edición, limpiar pasajeros existentes antes de agregar nuevos
            if (isEdit) {
                // Ir a la pestaña de pasajeros
                const tabPassengers = page.locator('#ui-id-2');
                try {
                    await tabPassengers.waitFor({ state: 'visible', timeout: 3000 });
                    await tabPassengers.evaluate(el => el.click());
                    console.log('✅ Pestaña Pasajeros activa');
                    await page.waitForTimeout(300);
                } catch (error) {
                    console.log('⚠️ No se pudo hacer click en la pestaña Pasajeros, continuando...', error.message);
                }
                
                // Limpiar pasajeros si hay cambios o si no hay datos originales
                if (changes?.passengers || !originData) {
                    console.log('🧹 Limpiando pasajeros existentes antes de agregar nuevos...');
                    await clearPassengers(page);
                } else {
                    console.log('⏭️  Saltando limpieza de pasajeros (sin cambios)');
                }
                
                // Si hay datos originales, solo procesar pasajeros que cambiaron o son nuevos
                if (originData) {
                    passengersToProcess = getChangedPassengers(reservationData.passengers, originData.passengers || []);
                    console.log(`📊 Pasajeros a procesar: ${passengersToProcess.length} de ${reservationData.passengers.length} (${passengersToProcess.filter(p => p.isNew).length} nuevos, ${passengersToProcess.filter(p => p.isModified).length} modificados)`);
                } else {
                    // Si no hay datos originales, procesar todos
                    console.log(`📊 Procesando todos los pasajeros (${passengersToProcess.length})`);
                }
            }
            
            if (passengersToProcess.length > 0) {
                for (let i = 0; i < passengersToProcess.length; i++) {
                    const passenger = passengersToProcess[i];
                    const status = passenger.isNew ? 'nuevo' : passenger.isModified ? 'modificado' : 'sin cambios';
                    console.log(`\n👤 Procesando pasajero ${i + 1} de ${passengersToProcess.length} (${status})`);
                    
                    // Abrir modal de nuevo pasajero
                    await newPassenger(page);
                    console.log('✅ Modal de nuevo pasajero abierto');
                    
                    // Llenar datos del pasajero
                    await dataPassenger(page, passenger);
                    console.log('✅ Datos del pasajero completados');
                    
                    // Esperar a que el modal se cierre completamente antes del siguiente pasajero
                    await page.waitForTimeout(500);
                }
            } else {
                console.log('⏭️  Saltando pasajeros (ninguno cambió)');
            }
        } else {
            console.log('⚠️ No se recibieron datos de pasajeros');
        }
        
        // Guardar la reserva en iTraffic
        await saveReservation(page);
        console.log('✅ Reserva guardada en iTraffic');
        
        // Obtener el código de la reserva generado
        const reservationCode = await getReservationCode(page);
        
        // Guardar en BD si se obtuvo el código (no validamos aquí porque saveReservation ya detecta duplicados)
        if (reservationCode && reservationData) {
            try {
                // Importar el servicio de base de datos dinámicamente para evitar dependencias circulares
                const { default: masterDataService } = await import('../services/mysqlMasterDataService.js');
                
                await masterDataService.saveReservation({
                    code: reservationCode,
                    userEmail: reservationData.userEmail || null,
                    conversationId: reservationData.conversationId || null
                });
                
                console.log(`✅ Código de reserva guardado en BD: ${reservationCode}`);
            } catch (dbError) {
                console.error('⚠️ Error al guardar código en BD (no crítico):', dbError.message);
                // No lanzar error, solo loguear, ya que la reserva ya se guardó en iTraffic
            }
        } else {
            if (!reservationCode) {
                console.log('⚠️ No se pudo obtener el código de reserva');
            }
            if (!reservationData) {
                console.log('⚠️ No hay datos de reserva para guardar en BD');
            }
        }
        
        return {
            success: true,
            message: 'Reserva creada exitosamente',
            reservationCode: reservationCode || null,
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
