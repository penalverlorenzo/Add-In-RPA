import { takeScreenshot } from "./utils/screenshot.js";
import { select2BySearch, fillInput, fillQuickFilterInput, fillQuickFilterDateRange, selectQuickFilterSelect2 } from "./helpers/utils.js";

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
 * Determina el tipo de item basado en el texto del botón
 * @param {string} itemText - Texto del botón
 * @returns {string} Tipo de item: 'servicio', 'hotel', 'eventual', 'programa'
 */
function getItemType(itemText) {
    const text = itemText.toLowerCase();
    if (text.includes('servicio')) return 'servicio';
    if (text.includes('hotel')) return 'hotel';
    if (text.includes('eventual')) return 'eventual';
    if (text.includes('programa') || text.includes('paquete')) return 'programa';
    return 'servicio'; // Default
}

/**
 * Llena los campos del filtro rápido para servicios
 */
async function fillServiceQuickFilter(page, service) {
    // Servicio
    if (service.servicio) {
        console.log(`🔍 Buscando servicio: ${service.servicio}`);
        await fillQuickFilterInput(page, 'Servicio', service.servicio, false);
        await page.waitForTimeout(500);
        console.log(`✅ Servicio ${service.servicio} completado`);
    }

    // Proveedor (si está disponible en service)
    if (service.proveedor) {
        console.log(`🏢 Seleccionando proveedor: ${service.proveedor}`);
        await selectQuickFilterSelect2(page, 'ServicioCodigoPrestador', service.proveedor);
        await page.waitForTimeout(500);
        console.log(`✅ Proveedor ${service.proveedor} seleccionado`);
    }

    // Ciudad
    if (service.destino) {
        console.log(`🌍 Seleccionando ciudad: ${service.destino}`);
        await selectQuickFilterSelect2(page, 'ServicioCiudad', service.destino);
        await page.waitForTimeout(500);
        console.log(`✅ Ciudad ${service.destino} seleccionada`);
    }

    // Fecha
    if (service.in) {
        console.log(`📅 Llenando rango de fechas: ${service.in} - ${service.out || service.in}`);
        await fillQuickFilterDateRange(page, service.in, service.out);
        await page.waitForTimeout(500);
        console.log(`✅ Fechas completadas`);
    }
}

/**
 * Llena los campos del filtro rápido para hoteles
 */
async function fillHotelQuickFilter(page, service) {
    // Hotel
    if (service.servicio) {
        console.log(`🏨 Buscando hotel: ${service.servicio}`);
        await fillQuickFilterInput(page, 'Hotel', service.servicio, false);
        await page.waitForTimeout(500);
        console.log(`✅ Hotel ${service.servicio} completado`);
    }

    // Ciudad
    if (service.destino) {
        console.log(`🌍 Seleccionando ciudad: ${service.destino}`);
        await selectQuickFilterSelect2(page, 'Hotelciudad', service.destino);
        await page.waitForTimeout(500);
        console.log(`✅ Ciudad ${service.destino} seleccionada`);
    }

    // Fecha
    if (service.in) {
        console.log(`📅 Llenando rango de fechas: ${service.in} - ${service.out || service.in}`);
        await fillQuickFilterDateRange(page, service.in, service.out);
        await page.waitForTimeout(500);
        console.log(`✅ Fechas completadas`);
    }
}

/**
 * Llena los campos del filtro rápido para programas
 */
async function fillProgramaQuickFilter(page, service) {
    // Código (si está disponible)
    if (service.codigo) {
        console.log(`🔢 Buscando código: ${service.codigo}`);
        await fillInput(page, 'input[id*="ppcod_paq"]', service.codigo, false);
        await page.waitForTimeout(500);
        console.log(`✅ Código ${service.codigo} completado`);
    }

    // Paquete
    if (service.servicio) {
        console.log(`📦 Buscando paquete: ${service.servicio}`);
        await fillQuickFilterInput(page, 'Paquete', service.servicio, false);
        await page.waitForTimeout(500);
        console.log(`✅ Paquete ${service.servicio} completado`);
    }

    // Ciudad
    if (service.destino) {
        console.log(`🌍 Seleccionando ciudad: ${service.destino}`);
        await selectQuickFilterSelect2(page, 'PaqueteCiudad', service.destino);
        await page.waitForTimeout(500);
        console.log(`✅ Ciudad ${service.destino} seleccionada`);
    }

    // Fecha
    if (service.in) {
        console.log(`📅 Llenando rango de fechas: ${service.in} - ${service.out || service.in}`);
        await fillQuickFilterDateRange(page, service.in, service.out);
        await page.waitForTimeout(500);
        console.log(`✅ Fechas completadas`);
    }
}

/**
 * Llena el campo de eventual (es un select2 en el diálogo principal, no en filtro rápido)
 */
async function fillEventualField(page, service) {
    if (service.servicio) {
        console.log(`🎯 Buscando eventual: ${service.servicio}`);
        // El selector para eventual es en el diálogo principal, no en filtro rápido
        const eventualSelector = 'div[id^="s2id_"][id*="Ideventual"]';
        await select2BySearch(page, eventualSelector, service.servicio);
        await page.waitForTimeout(500);
        console.log(`✅ Eventual ${service.servicio} seleccionado`);
    }
}

/**
 * Agrega un servicio/item a la reserva y completa todos sus campos
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} service - Objeto del servicio con estructura unificada
 * @param {string} service.servicio - Nombre del servicio/hotel/paquete/eventual
 * @param {string} service.destino - Destino del servicio (ej: "Mendoza", "Buenos Aires", "MDZ")
 * @param {string} service.proveedor - Proveedor del servicio (solo para servicios)
 * @param {string} service.in - Fecha de inicio en formato YYYY-MM-DD
 * @param {string} service.out - Fecha de fin en formato YYYY-MM-DD
 * @param {string} service.codigo - Código del paquete (solo para programas)
 * @param {string} service.estado - Código del estado (ej: "RQ", "AR", "OK", etc.)
 * @param {string} itemText - Texto del botón para agregar el item (default: 'Agregar Servicio')
 */
export async function addItemToReservation(page, service, itemText = 'Agregar Servicio') {
    console.log(`👤 Procesando item: ${service.servicio || service.descripcion || 'Sin descripción'}`);
    
    // Determinar tipo de item
    const itemType = getItemType(itemText);
    console.log(`📋 Tipo de item detectado: ${itemType}`);
    
    // Click en el botón para agregar el item
    console.log(`🔘 Buscando botón: "${itemText}"`);
    
    const buttonLocator = page.locator('div.tool-button.add-button')
        .filter({ has: page.locator('span.button-inner', { hasText: itemText }) });
    
    await buttonLocator.waitFor({ state: 'attached', timeout: 30000 });
    await buttonLocator.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await page.waitForTimeout(500);
    
    try {
        await buttonLocator.waitFor({ state: 'visible', timeout: 5000 });
        await buttonLocator.click();
    } catch (error) {
        console.log(`⚠️ Elemento no visible, usando force: true`);
        await buttonLocator.click({ force: true });
    }
    
    await page.waitForTimeout(2000);
    await takeScreenshot(page, `18-addItemToReservation-01-${itemType}-added`);
    console.log(`✅ Botón "${itemText}" clickeado`);
    
    // Para eventual, no hay botón de búsqueda, se llena directamente
    if (itemType === 'eventual') {
        await fillEventualField(page, service);
    } else {
        // Click en el botón de búsqueda específico según el tipo de item
        // Usar el título para identificar el botón correcto
        let searchButtonTitle;
        switch (itemType) {
            case 'servicio':
                searchButtonTitle = 'Búsqueda de Tarifas de Servicio';
                break;
            case 'hotel':
                searchButtonTitle = 'Búsqueda de Tarifas de Hoteles';
                break;
            case 'programa':
                searchButtonTitle = 'Búsqueda de Tarifas de Paquetes';
                break;
            default:
                searchButtonTitle = 'Búsqueda de Tarifas de Servicio';
        }
        
        const searchButton = page.locator(`a.inplace-button.inplace-action[title="${searchButtonTitle}"]`);
        await searchButton.waitFor({ state: 'visible', timeout: 5000 });
        await searchButton.click();
        await page.waitForTimeout(1000);
        
        // Llenar campos según el tipo de item
        switch (itemType) {
            case 'servicio':
                await fillServiceQuickFilter(page, service);
                break;
            case 'hotel':
                await fillHotelQuickFilter(page, service);
                break;
            case 'programa':
                await fillProgramaQuickFilter(page, service);
                break;
        }
    }
    // Llenar campos del diálogo principal (comunes a todos los tipos)
    // Fecha de inicio
    if (service.in) {
        console.log(`📅 Llenando fecha de inicio: ${service.in}`);
        const inDateFormatted = formatDateForInput(service.in);
        if (inDateFormatted) {
            await fillInput(page, 'input[id*="Det_rvaEditorDialog"][id$="_In_"]', inDateFormatted, true);
            await page.waitForTimeout(500);
            console.log(`✅ Fecha de inicio ${inDateFormatted} completada`);
        }
    }
    
    // Fecha de fin
    if (service.out) {
        console.log(`📅 Llenando fecha de fin: ${service.out}`);
        const outDateFormatted = formatDateForInput(service.out);
        if (outDateFormatted) {
            await fillInput(page, 'input[id*="Det_rvaEditorDialog"][id$="_Out"]', outDateFormatted, true);
            await page.waitForTimeout(500);
            console.log(`✅ Fecha de fin ${outDateFormatted} completada`);
        }
    }
    
    // Seleccionar el estado del servicio si está disponible
    if (service.estado) {
        console.log(`📋 Seleccionando estado: ${service.estado}`);
        
        // El selector del select de estado debe ser específico para el diálogo del item
        // El patrón del diálogo es: Det_rvaEditorDialog (no Det_rvaoWidgetEditor)
        // Esto evita conflictos con otros selects de estado en la página
        const estadoSelector = 'div[id^="s2id_"][id*="Det_rvaEditorDialog"][id*="Estadoope"]';
        
        // Buscar por el código del estado (ej: "AR" encontrará "AR - FAVOR RESERVAR [AR]")
        await select2BySearch(page, estadoSelector, service.estado);
        
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '18-addItemToReservation-04-estado-selected');
        console.log(`✅ Estado ${service.estado} seleccionado`);
    }
    
    await takeScreenshot(page, '18-addItemToReservation-05-all-fields-completed');
    console.log('✅ Item agregado con todos los campos completados');
    
    // Buscar el botón Guardar dentro del diálogo del item
    // El diálogo contiene los campos que acabamos de llenar (con Det_rvaEditorDialog en sus IDs)
    // Buscamos el diálogo que contiene el campo de estado y luego el botón dentro de él
    console.log('💾 Buscando botón Guardar...');
    
    // Buscar el diálogo que contiene el campo de estado del item
    // El campo de estado tiene el patrón Det_rvaEditorDialog, así que el diálogo debe contenerlo
    const estadoField = page.locator('div[id^="s2id_"][id*="Det_rvaEditorDialog"][id*="Estadoope"]');
    await estadoField.waitFor({ state: 'visible', timeout: 10000 });
    
    // Buscar el diálogo que contiene este campo usando filter con has
    const dialogLocator = page.locator('.ui-dialog:visible')
        .filter({ has: estadoField })
        .first();
    
    // Buscar el botón Guardar dentro del diálogo encontrado
    const saveButton = dialogLocator.locator('.tool-button.save-and-close-button', { hasText: 'Guardar' });
    await saveButton.waitFor({ state: 'visible', timeout: 10000 });
    await saveButton.click();
    
    await takeScreenshot(page, '18-addItemToReservation-06-saved');
    await page.waitForTimeout(1000);
    console.log('✅ Item guardado');
}
