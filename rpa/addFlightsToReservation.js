// rpa/addFlightsToReservation.js
import { select2BySearch, fillInput, convertToDDMMYYYY, disableJQueryUIOverlays } from './helpers/utils.js';
import { takeScreenshot } from './utils/screenshot.js';

/**
 * Verifica si aparece un toast de error después de una operación
 * @param {import('playwright').Page} page - Instancia de la página de Playwright
 * @returns {Promise<boolean>} true si hay un toast de error visible
 */
async function checkForErrorToast(page) {
    try {
        // Esperar un momento para que el toast aparezca si va a aparecer
        await page.waitForTimeout(500);
        
        // Buscar el toast de error
        const errorToast = page.locator('div#toast-container .toast.toast-error');
        const isVisible = await errorToast.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (isVisible) {
            // Leer el mensaje del toast
            const message = await errorToast.locator('.toast-message').textContent().catch(() => '');
            console.log(`⚠️ Toast de error detectado: ${message}`);
            
            // Intentar cerrar el toast haciendo clic en él o eliminándolo del DOM
            try {
                await errorToast.click({ timeout: 1000 }).catch(() => {});
                await page.waitForTimeout(200);
                // También intentar eliminarlo del DOM si no se cierra automáticamente
                await page.evaluate(() => {
                    const toast = document.querySelector('div#toast-container .toast.toast-error');
                    if (toast) {
                        toast.remove();
                    }
                }).catch(() => {});
            } catch (e) {
                // Ignorar errores al cerrar el toast
            }
            
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Agrega vuelos a la reserva en iTraffic
 * @param {import('playwright').Page} page - Instancia de la página de Playwright
 * @param {Array} flights - Array de objetos con datos de vuelos
 * @param {string} flights[].flightNumber - Número de vuelo
 * @param {string} flights[].airline - Aerolínea/Transportista
 * @param {string} flights[].origin - Origen (código IATA)
 * @param {string} flights[].destination - Destino (código IATA)
 * @param {string} flights[].departureDate - Fecha de salida
 * @param {string} flights[].departureTime - Hora de salida
 * @param {string} flights[].arrivalTime - Hora de llegada
 */
export async function addFlightsToReservation(page, flights) {
    if (!flights || !Array.isArray(flights) || flights.length === 0) {
        console.log('⚠️ No se recibieron vuelos para agregar');
        return;
    }

    console.log(`✈️ Procesando ${flights.length} vuelo(s)...`);

    // Deshabilitar overlays de jQuery UI
    await disableJQueryUIOverlays(page);
    await page.waitForTimeout(300);

    // PASO 1: Expandir la categoría "Ficha de Transporte"
    console.log('📂 Expandiendo categoría "Ficha de Transporte"...');
    
    // Buscar la categoría que contiene "Ficha de Transporte"
    const categoryTitle = page.locator('.category-title').filter({ hasText: 'Ficha de Transporte' });
    await categoryTitle.waitFor({ state: 'visible', timeout: 8000 });
    
    // Verificar si está colapsada
    const categoryContainer = categoryTitle.locator('..');
    const isCollapsed = await categoryContainer.evaluate(el => el.classList.contains('collapsed'));
    
    if (isCollapsed) {
        // Buscar el icono fa-plus dentro de la categoría
        const plusIcon = categoryTitle.locator('i.fa-plus');
        await plusIcon.waitFor({ state: 'visible', timeout: 5000 });
        await plusIcon.scrollIntoViewIfNeeded();
        await plusIcon.evaluate(el => el.click());
        console.log('✅ Categoría expandida');
        await page.waitForTimeout(500);
        
        // Verificar que se expandió
        const stillCollapsed = await categoryContainer.evaluate(el => el.classList.contains('collapsed'));
        if (stillCollapsed) {
            console.log('⚠️ La categoría aún está colapsada, intentando de nuevo...');
            await plusIcon.evaluate(el => el.click());
            await page.waitForTimeout(500);
        }
    } else {
        console.log('✅ Categoría ya está expandida');
    }

    await page.waitForTimeout(300);
    await takeScreenshot(page, '19-addFlights-01-category-expanded');

    // PASO 2: Iterar sobre cada vuelo
    for (let i = 0; i < flights.length; i++) {
        const flight = flights[i];
        console.log(`\n✈️ Procesando vuelo ${i + 1} de ${flights.length}: ${flight.flightNumber || 'sin número'}`);

        // Deshabilitar overlays antes de cada vuelo
        await disableJQueryUIOverlays(page);
        await page.waitForTimeout(300);

        // Hacer clic en el botón "Nuevo Rvavuelo"
        console.log('🆕 Haciendo clic en "Nuevo Rvavuelo"...');
        const newFlightButton = page
            .locator('div.tool-button.add-button')
            .filter({ hasText: 'Nuevo Rvavuelo' })
            .first();

        await newFlightButton.waitFor({ state: 'visible', timeout: 8000 });
        await newFlightButton.scrollIntoViewIfNeeded();
        await newFlightButton.evaluate(el => el.click());
        console.log('✅ Click en "Nuevo Rvavuelo" ejecutado');
        await page.waitForTimeout(500);

        // Esperar a que aparezca el diálogo del formulario
        const flightDialog = page.locator('.ui-dialog:has(.ui-dialog-title:text("Nuevo Rvavuelo"))');
        await flightDialog.waitFor({ state: 'visible', timeout: 8000 });
        await page.waitForTimeout(300);
        await takeScreenshot(page, `19-addFlights-02-${i + 1}-dialog-opened`);

        // PASO 3: Rellenar los campos del formulario
        
        // Transportista (Cod_prov) - Select2
        if (flight.airline) {
            console.log(`📝 Llenando Transportista: ${flight.airline}`);
            const transportistaSelector = page.locator('div[id^="s2id_"][id*="RvavueloEditorDialog"][id*="Cod_prov"]').first();
            await select2BySearch(page, transportistaSelector, flight.airline);
            await page.waitForTimeout(300);
        }

        // Estado (Status) - Select2 - usar valor por defecto "OK - CONFIRMADO [OK]"
        console.log('📝 Seleccionando Estado: OK - CONFIRMADO [OK]');
        const estadoSelector = page.locator('div[id^="s2id_"][id*="RvavueloEditorDialog"][id*="Status"]').first();
        await select2BySearch(page, estadoSelector, 'OK');
        await page.waitForTimeout(300);

        // De (Origen) - Select2
        if (flight.origin) {
            console.log(`📝 Llenando Origen (De): ${flight.origin}`);
            const origenSelector = page.locator('div[id^="s2id_"][id*="RvavueloEditorDialog"][id*="Origen"]').first();
            await select2BySearch(page, origenSelector, flight.origin);
            await page.waitForTimeout(300);
            
            // Verificar si aparece un toast de error (código IATA no existe)
            const hasError = await checkForErrorToast(page);
            if (hasError) {
                // Cerrar el diálogo antes de lanzar el error
                try {
                    const closeButton = flightDialog.locator('.ui-dialog-titlebar-close').first();
                    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await closeButton.click();
                        await page.waitForTimeout(300);
                    }
                } catch (e) {
                    // Ignorar errores al cerrar
                }
                throw new Error(`El código de origen "${flight.origin}" no existe o es incorrecto. Por favor, verifica el código IATA del aeropuerto de origen.`);
            }
        }

        // A (Destino) - Select2
        if (flight.destination) {
            console.log(`📝 Llenando Destino (A): ${flight.destination}`);
            const destinoSelector = page.locator('div[id^="s2id_"][id*="RvavueloEditorDialog"][id*="Destino"]').first();
            await select2BySearch(page, destinoSelector, flight.destination);
            await page.waitForTimeout(300);
            
            // Verificar si aparece un toast de error (código IATA no existe)
            const hasError = await checkForErrorToast(page);
            if (hasError) {
                // Cerrar el diálogo antes de lanzar el error
                try {
                    const closeButton = flightDialog.locator('.ui-dialog-titlebar-close').first();
                    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await closeButton.click();
                        await page.waitForTimeout(300);
                    }
                } catch (e) {
                    // Ignorar errores al cerrar
                }
                throw new Error(`El código de destino "${flight.destination}" no existe o es incorrecto. Por favor, verifica el código IATA del aeropuerto de destino.`);
            }
        }

        // Fecha (Fec_desde) - Input de fecha
        if (flight.departureDate) {
            console.log(`📝 Llenando Fecha: ${flight.departureDate}`);
            const fechaFormatted = convertToDDMMYYYY(flight.departureDate);
            if (fechaFormatted) {
                const fechaInput = page.locator('input[id*="RvavueloEditorDialog"][id*="Fec_desde"]').first();
                await fillInput(page, fechaInput, fechaFormatted, true);
                await page.waitForTimeout(300);
            } else {
                console.log(`⚠️ No se pudo convertir la fecha: ${flight.departureDate}`);
            }
        }

        // Código (Nro_vuelo) - Input de texto
        if (flight.flightNumber) {
            console.log(`📝 Llenando Código de vuelo: ${flight.flightNumber}`);
            const codigoInput = page.locator('input[id*="RvavueloEditorDialog"][id*="Nro_vuelo"]').first();
            await fillInput(page, codigoInput, flight.flightNumber);
            await page.waitForTimeout(300);
        }

        // Sale (Hora_sale) - Input de texto
        if (flight.departureTime) {
            console.log(`📝 Llenando Hora de salida (Sale): ${flight.departureTime}`);
            const horaSaleInput = page.locator('input[id*="RvavueloEditorDialog"][id*="Hora_sale"]').first();
            await fillInput(page, horaSaleInput, flight.departureTime);
            await page.waitForTimeout(300);
        }

        // Llega (Hora_llega) - Input de texto
        if (flight.arrivalTime) {
            console.log(`📝 Llenando Hora de llegada (Llega): ${flight.arrivalTime}`);
            const horaLlegaInput = page.locator('input[id*="RvavueloEditorDialog"][id*="Hora_llega"]').first();
            await fillInput(page, horaLlegaInput, flight.arrivalTime);
            await page.waitForTimeout(300);
        }

        // Clase (Clase) - Select2 - preparado pero sin implementar (solo tiene opción XX)
        // TODO: Implementar cuando se necesite cambiar la clase
        console.log('📝 Campo Clase dejado sin modificar (solo tiene opción XX por ahora)');

        await takeScreenshot(page, `19-addFlights-03-${i + 1}-form-filled`);

        // PASO 4: Guardar el vuelo
        console.log('💾 Guardando vuelo...');
        await disableJQueryUIOverlays(page);
        await page.waitForTimeout(300);

        // Buscar el botón Guardar dentro del diálogo del vuelo
        const saveButton = flightDialog
            .locator('.tool-button.save-and-close-button')
            .filter({ hasText: 'Guardar' })
            .first();

        await saveButton.waitFor({ state: 'attached', timeout: 5000 });
        await saveButton.scrollIntoViewIfNeeded();
        await saveButton.click();
        console.log('💾 Click Guardar ejecutado');
        await page.waitForTimeout(300);

        // Esperar a que el diálogo se cierre
        await flightDialog.waitFor({ state: 'hidden', timeout: 8000 });
        await page.waitForTimeout(500);
        await takeScreenshot(page, `19-addFlights-04-${i + 1}-saved`);

        console.log(`✅ Vuelo ${i + 1} guardado correctamente`);
    }

    console.log(`✅ Todos los vuelos procesados (${flights.length})`);
}
