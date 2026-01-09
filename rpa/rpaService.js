// rpa/rpaService.js
import { createBrowser, saveSession } from './browser.js';
import { loginITraffic } from './login.js';
import { ensureSession } from './session.js';
import { navigateToDashboard } from './dashboard.js';
import { newReservation } from './newReservation.js';
import { newPassenger } from './newPassenger.js';
import { dataPassenger } from './dataPassenger.js';
import { saveReservation } from './saveReservation.js';
import { verifyFirstReservation } from './verifyFirstReservation.js';

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
        const expectedPassengerName = reservationData.passengers[0].firstName + ' ' + reservationData.passengers[0].lastName;
        const expectedPassangerReverseName = reservationData.passengers[0].lastName + ' ' + reservationData.passengers[0].firstName;
        const isreservationSaved = await verifyFirstReservation(page, [expectedPassengerName, expectedPassangerReverseName]);
        return {
            success: true,
            isreservationSaved: isreservationSaved,
            message: isreservationSaved ? 'Reserva creada exitosamente' : 'Reserva no creada',
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
