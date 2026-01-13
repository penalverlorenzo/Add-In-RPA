import { takeScreenshot } from "./utils/screenshot.js";
import { select2BySearch, fillInput } from "./helpers/utils.js";

/**
 * Convierte fecha de formato YYYY-MM-DD a MM/DD/YYYY
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {string|null} Fecha en formato MM/DD/YYYY o null si no es válida
 */
function formatDateForInput(dateStr) {
    if (!dateStr) return null;
    
    // Si ya está en formato MM/DD/YYYY, retornarlo
    if (dateStr.includes('/')) return dateStr;
    
    // Convertir de YYYY-MM-DD a MM/DD/YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    
    return null;
}

/**
 * Agrega un servicio/item a la reserva y completa todos sus campos
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} service - Objeto del servicio con estructura unificada
 * @param {string} service.destino - Destino del servicio (ej: "Mendoza", "Buenos Aires")
 * @param {string} service.in - Fecha de inicio en formato YYYY-MM-DD
 * @param {string} service.out - Fecha de fin en formato YYYY-MM-DD
 * @param {number} service.nts - Cantidad de noches
 * @param {string} service.estado - Código del estado (ej: "RQ", "AR", "OK", etc.)
 * @param {string} itemText - Texto del botón para agregar el item (default: 'Agregar Servicio')
 */
export async function addItemToReservation(page, service, itemText = 'Agregar Servicio') {
    console.log(`👤 Procesando servicio: ${service.servicio || service.descripcion || 'Sin descripción'}`);
    
    // Click en el botón para agregar el servicio
    await page.locator('.button-inner', { hasText: itemText }).click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '18-addItemToReservation-01-item-added');
    
    // Seleccionar el destino del servicio si está disponible
    if (service.destino) {
        console.log(`🌍 Seleccionando destino: ${service.destino}`);
        
        // El selector del select de destino tiene el patrón: id*="Destino" o label con texto "Destino"
        // Buscamos el contenedor Select2 que corresponde al campo de destino
        const destinoSelector = 'div[id^="s2id_"][id*="Destino"]';
        
        // Buscar por el nombre del destino (ej: "Mendoza" encontrará opciones que contengan "Mendoza")
        await select2BySearch(page, destinoSelector, service.destino);
        
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '18-addItemToReservation-02-destino-selected');
        console.log(`✅ Destino ${service.destino} seleccionado`);
    }
    
    // Llenar campo In_ (fecha de inicio)
    if (service.in) {
        console.log(`📅 Llenando fecha de inicio: ${service.in}`);
        const inDateFormatted = formatDateForInput(service.in);
        if (inDateFormatted) {
            // Selector: input con id que contiene "Det_rvaEditorDialog" y termina con "_In_"
            await fillInput(page, 'input[id*="Det_rvaEditorDialog"][id$="_In_"]', inDateFormatted, true);
            await page.waitForTimeout(500);
            console.log(`✅ Fecha de inicio ${inDateFormatted} completada`);
        }
    }
    
    // Llenar campo Out (fecha de fin)
    if (service.out) {
        console.log(`📅 Llenando fecha de fin: ${service.out}`);
        const outDateFormatted = formatDateForInput(service.out);
        if (outDateFormatted) {
            // Selector: input con id que contiene "Det_rvaEditorDialog" y termina con "_Out"
            await fillInput(page, 'input[id*="Det_rvaEditorDialog"][id$="_Out"]', outDateFormatted, true);
            await page.waitForTimeout(500);
            console.log(`✅ Fecha de fin ${outDateFormatted} completada`);
        }
    }
    
    // Llenar campo Nts (noches)
    if (service.nts !== undefined && service.nts !== null) {
        console.log(`🌙 Llenando cantidad de noches: ${service.nts}`);
        // Selector: input con id que contiene "Det_rvaEditorDialog" y termina con "_Nts"
        await fillInput(page, 'input[id*="Det_rvaEditorDialog"][id$="_Nts"]', String(service.nts), false);
        await page.waitForTimeout(500);
        console.log(`✅ Cantidad de noches ${service.nts} completada`);
    }
    
    // Seleccionar el estado del servicio si está disponible
    if (service.estado) {
        console.log(`📋 Seleccionando estado: ${service.estado}`);
        
        // El selector del select de estado tiene el patrón: id*="Estadoope"
        // Usamos un selector que busque el contenedor Select2 con ese patrón
        const estadoSelector = 'div[id^="s2id_"][id*="Estadoope"]';
        
        // Buscar por el código del estado (ej: "AR" encontrará "AR - FAVOR RESERVAR [AR]")
        await select2BySearch(page, estadoSelector, service.estado);
        
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '18-addItemToReservation-04-estado-selected');
        console.log(`✅ Estado ${service.estado} seleccionado`);
    }
    
    await takeScreenshot(page, '18-addItemToReservation-05-all-fields-completed');
    console.log('✅ Item agregado con todos los campos completados');
    await page.locator('.tool-button.save-and-close-button', { hasText: 'Guardar' }).click();
    await takeScreenshot(page, '18-addItemToReservation-06-saved');
    await page.waitForTimeout(1000);
    console.log('✅ Item guardado');
}
