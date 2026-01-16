import { takeScreenshot } from "./utils/screenshot.js";
import { select2BySearch, fillInput, fillQuickFilterInput, fillQuickFilterDateRange, selectQuickFilterSelect2 } from "./helpers/utils.js";

/**
 * Extrae el texto de una celda de la tabla
 * @param {import('playwright').Locator} row - Locator de la fila
 * @param {number} cellIndex - Índice de la celda (l0, l1, l2, etc.)
 * @returns {Promise<string>} Texto de la celda
 */
async function getCellText(row, cellIndex) {
    try {
        const cell = row.locator(`div.slick-cell.l${cellIndex}.r${cellIndex}`);
        const text = await cell.textContent();
        return (text || '').trim();
    } catch (e) {
        return '';
    }
}

/**
 * Calcula el score de coincidencia entre una fila de la tabla y los datos del servicio
 * @param {Object} rowData - Datos extraídos de la fila
 * @param {Object} serviceData - Datos del servicio recibido
 * @param {string} itemType - Tipo de item: 'hotel', 'servicio', 'programa'
 * @returns {number} Score de coincidencia (0-100)
 */
function calculateMatchScore(rowData, serviceData, itemType) {
    let score = 0;
    let maxScore = 0;

    if (itemType === 'hotel') {
        // Nombre del hotel - usar nombre_hotel o servicio como fallback
        const hotelName = serviceData.nombre_hotel || serviceData.servicio;
        if (hotelName && rowData.nombre_hotel) {
            maxScore += 40;
            const serviceName = hotelName.toLowerCase();
            const rowName = rowData.nombre_hotel.toLowerCase();
            if (rowName.includes(serviceName) || serviceName.includes(rowName)) {
                score += 40;
            } else if (serviceName.split(' ').some(word => rowName.includes(word) && word.length > 3)) {
                score += 20;
            }
        }

        // Tipo de habitación
        if (serviceData.tipo_habitacion && rowData.tipo_habitacion) {
            maxScore += 30;
            if (serviceData.tipo_habitacion === rowData.tipo_habitacion) {
                score += 30;
            }
        }

        // Ciudad - usar Ciudad o destino como fallback
        const ciudad = serviceData.Ciudad || serviceData.destino;
        if (ciudad && rowData.ciudad) {
            maxScore += 20;
            const serviceCity = ciudad.toLowerCase();
            const rowCity = rowData.ciudad.toLowerCase();
            if (serviceCity === rowCity || serviceCity.includes(rowCity) || rowCity.includes(serviceCity)) {
                score += 20;
            }
        }

        // Categoría
        if (serviceData.Categoria && rowData.categoria) {
            maxScore += 10;
            const serviceCat = serviceData.Categoria.toLowerCase();
            const rowCat = rowData.categoria.toLowerCase();
            if (rowCat.includes(serviceCat) || serviceCat.includes(rowCat)) {
                score += 10;
            }
        }
    } else if (itemType === 'servicio') {
        // Nombre del servicio
        if (serviceData.servicio && rowData.servicio) {
            maxScore += 50;
            const serviceName = serviceData.servicio.toLowerCase();
            const rowName = rowData.servicio.toLowerCase();
            if (rowName.includes(serviceName) || serviceName.includes(rowName)) {
                score += 50;
            } else {
                // Comparar palabras clave
                const serviceWords = serviceName.split(/\s+/);
                const rowWords = rowName.split(/\s+/);
                const commonWords = serviceWords.filter(w => rowWords.includes(w));
                if (commonWords.length > 0) {
                    score += (commonWords.length / serviceWords.length) * 50;
                }
            }
        }

        // Ciudad
        if (serviceData.destino && rowData.ciudad) {
            maxScore += 30;
            const serviceCity = serviceData.destino.toLowerCase();
            const rowCity = rowData.ciudad.toLowerCase();
            if (serviceCity === rowCity || serviceCity.includes(rowCity) || rowCity.includes(serviceCity)) {
                score += 30;
            }
        }

        // Proveedor (si está disponible)
        if (serviceData.proveedor && rowData.proveedor) {
            maxScore += 20;
            const serviceProv = serviceData.proveedor.toLowerCase();
            const rowProv = rowData.proveedor.toLowerCase();
            if (serviceProv === rowProv || rowProv.includes(serviceProv)) {
                score += 20;
            }
        }
    } else if (itemType === 'programa') {
        // Código del paquete
        if (serviceData.codigo && rowData.codigo) {
            maxScore += 40;
            if (serviceData.codigo === rowData.codigo) {
                score += 40;
            }
        }

        // Nombre del paquete
        if (serviceData.servicio && rowData.servicio) {
            maxScore += 40;
            const serviceName = serviceData.servicio.toLowerCase();
            const rowName = rowData.servicio.toLowerCase();
            if (rowName.includes(serviceName) || serviceName.includes(rowName)) {
                score += 40;
            }
        }

        // Ciudad
        if (serviceData.destino && rowData.ciudad) {
            maxScore += 20;
            const serviceCity = serviceData.destino.toLowerCase();
            const rowCity = rowData.ciudad.toLowerCase();
            if (serviceCity === rowCity || serviceCity.includes(rowCity) || rowCity.includes(serviceCity)) {
                score += 20;
            }
        }
    }

    return maxScore > 0 ? (score / maxScore) * 100 : 0;
}

/**
 * Selecciona el mejor match de la tabla de resultados y hace click en OK
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} service - Datos del servicio/hotel/programa
 * @param {string} itemType - Tipo de item: 'hotel', 'servicio', 'programa'
 */
async function selectBestMatchFromTable(page, service, itemType) {
    console.log(`🔍 Buscando mejor coincidencia en la tabla para ${itemType}...`);
    
    // Buscar el botón OK del diálogo de búsqueda de tarifas
    // Este es el diálogo que se abre después del botón de búsqueda
    const okButton = page.locator('div.ui-dialog-buttonset button:has-text("OK")').first();
    await okButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Encontrar el diálogo que contiene este botón OK usando evaluateHandle
    const dialog = page.locator('div.ui-dialog:visible').filter({ has: okButton }).first();

    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    
    await page.waitForTimeout(1500); // Dar tiempo para que se carguen los resultados
    
    // Buscar la tabla dentro del diálogo - usar el grid-canvas que contiene las filas de datos
    // El grid-canvas-top-grid-canvas-left es el que contiene las filas principales
    // Buscar dentro del contenido del diálogo específicamente
    const dialogContent = dialog.locator('.ui-dialog-content');
    const tableContainer = dialogContent.locator('.grid-canvas.grid-canvas-top.grid-canvas-left').first();
    await tableContainer.waitFor({ state: 'visible', timeout: 10000 });
    
    // Obtener todas las filas dentro del grid-canvas del diálogo (excluyendo las filas de grupo)
    // Buscar las filas dentro del grid-canvas específico del diálogo
    const rows = tableContainer.locator('div.ui-widget-content.slick-row:not(.slick-group)');
    const rowCount = await rows.count();
    
    console.log(`📊 Encontradas ${rowCount} filas en la tabla`);
    
    if (rowCount === 0) {
        console.log('⚠️ No se encontraron resultados en la tabla');
        // Hacer click en Cancelar si no hay resultados
        const cancelButton = dialog.locator('div.ui-dialog-buttonset button:has-text("Cancelar")');
        if (await cancelButton.count() > 0) {
            await cancelButton.click();
            await page.waitForTimeout(500);
        }
        return;
    }
    
    let bestMatch = null;
    let bestScore = 0;
    let bestRowIndex = -1;
    
    // Analizar cada fila
    for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        let rowData = {};
        
        try {
            if (itemType === 'hotel') {
                // Hotel según SelectableOptions.txt: l0=Nombre hotel, l1=Ciudad, l3=Fecha desde, l4=Fecha hasta, l5=Tipo habitación, l9=Categoría
                rowData = {
                    nombre_hotel: await getCellText(row, 0),
                    ciudad: await getCellText(row, 1),
                    fechaDesde: await getCellText(row, 3),
                    fechaHasta: await getCellText(row, 4),
                    tipo_habitacion: await getCellText(row, 5),
                    categoria: await getCellText(row, 9)
                };
            } else if (itemType === 'servicio') {
                // Servicio según SelectableOptions.txt: l0=Nombre servicio, l1=Proveedor, l2=Ciudad, l4=Fecha desde, l5=Fecha hasta
                rowData = {
                    servicio: await getCellText(row, 0),
                    proveedor: await getCellText(row, 1),
                    ciudad: await getCellText(row, 2),
                    fechaDesde: await getCellText(row, 4),
                    fechaHasta: await getCellText(row, 5)
                };
            } else if (itemType === 'programa') {
                // Programa según SelectableOptions.txt: l0=Código, l2=Proveedor, l5=Fecha desde, l6=Fecha hasta, l9=Categoría
                // El nombre del programa puede estar en el grupo (slick-group-title) o ser el mismo código
                rowData = {
                    codigo: await getCellText(row, 0),
                    proveedor: await getCellText(row, 2),
                    fechaDesde: await getCellText(row, 5),
                    fechaHasta: await getCellText(row, 6),
                    categoria: await getCellText(row, 9)
                };
                // Intentar obtener el nombre del grupo si existe
                // Buscar el grupo más cercano antes de esta fila dentro del mismo grid-canvas
                try {
                    const allGroups = tableContainer.locator('div.slick-row.slick-group');
                    const groupCount = await allGroups.count();
                    let foundGroup = false;
                    
                    // Buscar el grupo que está antes de esta fila
                    for (let g = 0; g < groupCount; g++) {
                        const group = allGroups.nth(g);
                        const groupIndex = await group.evaluate(el => {
                            const parent = el.parentElement;
                            return Array.from(parent.children).indexOf(el);
                        });
                        const rowIndex = await row.evaluate(el => {
                            const parent = el.parentElement;
                            return Array.from(parent.children).indexOf(el);
                        });
                        
                        if (groupIndex < rowIndex) {
                            const groupTitle = await group.locator('.slick-group-title').textContent();
                            if (groupTitle && groupTitle.trim() !== 'undefined') {
                                rowData.servicio = groupTitle.trim();
                                foundGroup = true;
                                break;
                            }
                        }
                    }
                    
                    if (!foundGroup) {
                        // Si no hay grupo, usar el código como nombre
                        rowData.servicio = rowData.codigo;
                    }
                } catch (e) {
                    // Si hay error, usar el código como nombre
                    rowData.servicio = rowData.codigo;
                }
            }
            
            const score = calculateMatchScore(rowData, service, itemType);
            console.log(`  Fila ${i + 1}: Score ${score.toFixed(2)}% - ${JSON.stringify(rowData)}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = rowData;
                bestRowIndex = i;
            }
        } catch (error) {
            console.log(`  ⚠️ Error procesando fila ${i + 1}:`, error.message);
        }
    }
    
    if (bestRowIndex >= 0 && bestScore > 30) { // Solo seleccionar si el score es razonable
        console.log(`✅ Mejor coincidencia encontrada en fila ${bestRowIndex + 1} con score ${bestScore.toFixed(2)}%`);
        const bestRow = rows.nth(bestRowIndex);
        
        // Hacer click en la fila para seleccionarla
        await bestRow.click();
        await page.waitForTimeout(500);
        
        // Hacer click en el botón OK dentro del diálogo (usar el mismo okButton que encontramos al inicio)
        await okButton.click();
        await page.waitForTimeout(1000);
        console.log(`✅ Fila seleccionada y modal cerrado`);
    } else {
        console.log(`⚠️ No se encontró una coincidencia suficientemente buena (mejor score: ${bestScore.toFixed(2)}%)`);
        // Si no hay buena coincidencia, seleccionar la primera fila por defecto
        if (rowCount > 0) {
            console.log(`📌 Seleccionando primera fila por defecto`);
            await rows.first().click();
            await page.waitForTimeout(500);
            await okButton.click();
            await page.waitForTimeout(1000);
            console.log(`✅ Primera fila seleccionada y modal cerrado`);
        } else {
            // Si no hay filas, hacer click en Cancelar
            console.log(`⚠️ No hay filas disponibles, cerrando modal`);
            const cancelButton = dialog.locator('div.ui-dialog-buttonset button:has-text("Cancelar")');
            if (await cancelButton.count() > 0) {
                await cancelButton.click();
                await page.waitForTimeout(500);
            }
        }
    }
}

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
    // Hotel - usar nombre_hotel si está disponible, sino servicio
    const hotelName = service.nombre_hotel || service.servicio;
    if (hotelName) {
        console.log(`🏨 Buscando hotel: ${hotelName}`);
        await fillQuickFilterInput(page, 'Hotel', hotelName, false);
        await page.waitForTimeout(500);
        console.log(`✅ Hotel ${hotelName} completado`);
    }

    // Ciudad - usar Ciudad si está disponible, sino destino
    const ciudad = service.Ciudad || service.destino;
    if (ciudad) {
        console.log(`🌍 Seleccionando ciudad: ${ciudad}`);
        await selectQuickFilterSelect2(page, 'Hotelciudad', ciudad);
        await page.waitForTimeout(500);
        console.log(`✅ Ciudad ${ciudad} seleccionada`);
    }

    // Fecha - usar checkIn/checkOut si están disponibles, sino in/out
    const fechaIn = service.checkIn || service.in;
    const fechaOut = service.checkOut || service.out;
    if (fechaIn) {
        console.log(`📅 Llenando rango de fechas: ${fechaIn} - ${fechaOut || fechaIn}`);
        await fillQuickFilterDateRange(page, fechaIn, fechaOut);
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
    // Para eventual, no hay botón de búsqueda, se llena directamente
    if (itemType === 'eventual') {
        await fillEventualField(page, service);
    } else {
        // Click en el botón de búsqueda específico según el tipo de item
        // Usar el título para identificar el botón correcto
        let searchButtonTitle;
        let searchButtonSelector;
        switch (itemType) {
            case 'servicio':
                searchButtonTitle = 'Búsqueda de Tarifas de Servicio';
                searchButtonSelector = 'div.field.Cod_serv';
                break;
                case 'hotel':
                    searchButtonTitle = 'Búsqueda de Tarifas de Hoteles';
                    searchButtonSelector = 'div.field.Cod_prov';
                    break;
                    case 'programa':
                        searchButtonTitle = 'Búsqueda de Tarifas de Paquetes';
                        searchButtonSelector = 'div.field.Idpaquete';
                        break;
            default:
                searchButtonTitle = 'Búsqueda de Tarifas de Servicio';
                searchButtonSelector = 'div.field.Cod_serv';
        }
        
        const searchButton = page.locator(searchButtonSelector).locator(`a.inplace-button.inplace-action[title="${searchButtonTitle}"]`);

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
        
        // Esperar a que aparezcan los resultados y seleccionar el mejor match
        await page.waitForTimeout(2000); // Dar tiempo para que se carguen los resultados
        await selectBestMatchFromTable(page, service, itemType);
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
    
    
    await takeScreenshot(page, '18-addItemToReservation-05-all-fields-completed');
    console.log('✅ Item agregado con todos los campos completados');
    
    // Buscar el botón Guardar dentro del diálogo del item
    // El diálogo contiene los campos que acabamos de llenar (con Det_rvaEditorDialog en sus IDs)
    // Buscamos el diálogo que contiene el campo de estado y luego el botón dentro de él
    console.log('💾 Buscando botón Guardar...');

    // 1️⃣ Tomar el diálogo ACTIVO (el que está al frente)
    const dialog = page.locator('div.ui-dialog.ui-front').last();
    
    // 2️⃣ Asegurar que esté visible
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    
    // 3️⃣ Buscar Guardar SOLO dentro de ese diálogo
    const saveButton = dialog.locator(
      '.tool-button.save-and-close-button'
    ).last();
    
    await saveButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // 4️⃣ Click seguro
    await saveButton.click();
    
    await takeScreenshot(page, '18-addItemToReservation-06-saved');
    await page.waitForTimeout(1000);
    console.log('✅ Item guardado');
    
}
