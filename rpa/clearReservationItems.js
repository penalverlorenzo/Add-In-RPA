import { takeScreenshot } from "./utils/screenshot.js";

/**
 * Limpia todos los servicios/hoteles de la reserva
 * @param {import('playwright').Page} page - Página de Playwright
 */
export async function clearServicesAndHotels(page) {
    try {
        console.log('🧹 Limpiando servicios y hoteles existentes...');
        
        // Buscar directamente los links de items (servicios y hoteles) sin necesidad de encontrar el contenedor del grid
        // Los links tienen la clase s-Serene-E_Ventas-Det_rvaEditorLink
        // Excluir los que están en filas con clase "new-row" (filas vacías nuevas)
        const itemLinks = page.locator('div.slick-row:not(.new-row) a.s-Serene-E_Ventas-Det_rvaEditorLink');
        await page.waitForTimeout(500); // Esperar a que la tabla se cargue completamente
        const itemCount = await itemLinks.count();
        
        console.log(`📋 Encontrados ${itemCount} items (servicios/hoteles) para eliminar`);
        
        if (itemCount === 0) {
            console.log('✅ No hay items para eliminar');
            return;
        }
        
        // Eliminar cada item de atrás hacia adelante (para evitar problemas con índices)
        for (let i = itemCount - 1; i >= 0; i--) {
            try {
                const itemLink = itemLinks.nth(i);
                const itemText = await itemLink.textContent({timeout: 500});
                console.log(`🗑️  Eliminando item ${i + 1}/${itemCount}: ${itemText?.trim() || 'sin texto'}`);
                
                // Hacer click en el link del item
                await itemLink.scrollIntoViewIfNeeded();
                await itemLink.click();
                await page.waitForTimeout(600);
                
                // Esperar a que aparezca el diálogo "Editar Items"
                // Buscar por el título del diálogo
                const editDialog = page.locator('.ui-dialog:has(.ui-dialog-title:has-text("Editar Items"))').first();
                await editDialog.waitFor({ state: 'visible', timeout: 2000 });
                
                // Buscar el botón de borrar dentro del diálogo
                const deleteButton = editDialog.locator('.tool-button.delete-button').first();
                await deleteButton.waitFor({ state: 'visible', timeout: 5000 });
                
                // Hacer click en borrar
                await deleteButton.scrollIntoViewIfNeeded();
                await deleteButton.click();
                await page.waitForTimeout(300);
                
                // Esperar a que aparezca el diálogo de confirmación
                const confirmDialog = page.locator('.ui-dialog.s-ConfirmDialog:has(.ui-dialog-title:has-text("Confirmar"))').first();
                try {
                    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
                    console.log('✅ Diálogo de confirmación encontrado');
                    
                    // Buscar el botón "Sí" dentro del diálogo de confirmación
                    const yesButton = confirmDialog.locator('button:has-text("Sí")').first();
                    await yesButton.waitFor({ state: 'visible', timeout: 3000 });
                    await yesButton.click();
                    console.log('✅ Click en botón "Sí" de confirmación');
                    await page.waitForTimeout(300);
                    
                    // Esperar a que el diálogo de confirmación se cierre
                    await confirmDialog.waitFor({ state: 'hidden', timeout: 5000 });
                } catch (confirmError) {
                    console.log('⚠️ No se encontró diálogo de confirmación o botón "Sí"', confirmError.message);
                }
                
                // Esperar a que el diálogo de edición se cierre
                try {
                    await editDialog.waitFor({ state: 'hidden', timeout: 2000 });
                } catch (e) {
                    console.log('⚠️ El diálogo de edición no se cerró automáticamente');
                    // Intentar cerrar el diálogo principal si aún está abierto
                    const closeButton = editDialog.locator('.ui-dialog-titlebar-close').first();
                    if (await closeButton.isVisible().catch(() => false)) {
                        await closeButton.click();
                        await page.waitForTimeout(200);
                    }
                }
                
                console.log(`✅ Item ${i + 1} eliminado`);
                await page.waitForTimeout(500);
                
            } catch (error) {
                console.error(`❌ Error al eliminar item ${i + 1}:`, error.message);
                // Intentar cerrar el diálogo si está abierto
                try {
                    const closeButton = page.locator('.ui-dialog-titlebar-close').first();
                    if (await closeButton.isVisible()) {
                        await closeButton.click();
                        await page.waitForTimeout(200);
                    }
                } catch (e) {
                    // Ignorar error al cerrar
                }
            }
        }
        
        console.log('✅ Limpieza de servicios y hoteles completada');
        await takeScreenshot(page, 'clearServicesAndHotels-completed');
        
    } catch (error) {
        console.error('❌ Error al limpiar servicios y hoteles:', error.message);
        throw error;
    }
}

/**
 * Limpia todos los pasajeros de la reserva
 * @param {import('playwright').Page} page - Página de Playwright
 */
export async function clearPassengers(page) {
    try {
        console.log('🧹 Limpiando pasajeros existentes...');
        
        // Buscar directamente los links de pasajeros sin necesidad de encontrar el contenedor del grid
        // Los links tienen la clase s-Serene-E_Ventas-RvapaxEditorLink
        const passengerLinks = page.locator('a.s-Serene-E_Ventas-RvapaxEditorLink');
        await page.waitForTimeout(600); // Esperar a que la tabla se cargue completamente
        const passengerCount = await passengerLinks.count();
        
        console.log(`📋 Encontrados ${passengerCount} pasajeros para eliminar`);
        
        if (passengerCount === 0) {
            console.log('✅ No hay pasajeros para eliminar');
            return;
        }
        
        // Eliminar cada pasajero de atrás hacia adelante
        for (let i = passengerCount - 1; i >= 0; i--) {
            try {
                const passengerLink = passengerLinks.nth(i);
                const passengerText = await passengerLink.textContent({timeout: 500});
                console.log(`🗑️  Eliminando pasajero ${i + 1}/${passengerCount}: ${passengerText?.trim() || 'sin texto'}`);
                
                // Hacer click en el link del pasajero
                await passengerLink.scrollIntoViewIfNeeded();
                await passengerLink.click();
                await page.waitForTimeout(500);
                
                // Esperar a que aparezca el diálogo "Editar Pasajero"
                const editDialog = page.locator('.ui-dialog:has(.ui-dialog-title:has-text("Editar Pasajero"))').first();
                await editDialog.waitFor({ state: 'visible', timeout: 2000 });
                
                // Buscar el botón de borrar dentro del diálogo
                const deleteButton = editDialog.locator('.tool-button.delete-button').first();
                await deleteButton.waitFor({ state: 'visible', timeout: 2000 });
                
                // Hacer click en borrar
                await deleteButton.scrollIntoViewIfNeeded();
                await deleteButton.click();
                await page.waitForTimeout(300);
                
                // Esperar a que aparezca el diálogo de confirmación
                const confirmDialog = page.locator('.ui-dialog.s-ConfirmDialog:has(.ui-dialog-title:has-text("Confirmar"))').first();
                try {
                    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
                    console.log('✅ Diálogo de confirmación encontrado');
                    
                    // Buscar el botón "Sí" dentro del diálogo de confirmación
                    const yesButton = confirmDialog.locator('button:has-text("Sí")').first();
                    await yesButton.waitFor({ state: 'visible', timeout: 3000 });
                    await yesButton.click();
                    console.log('✅ Click en botón "Sí" de confirmación');
                    await page.waitForTimeout(300);
                    
                    // Esperar a que el diálogo de confirmación se cierre
                    await confirmDialog.waitFor({ state: 'hidden', timeout: 5000 });
                } catch (confirmError) {
                    console.log('⚠️ No se encontró diálogo de confirmación o botón "Sí"', confirmError.message);
                }
                
                // Esperar a que el diálogo de edición se cierre
                try {
                    await editDialog.waitFor({ state: 'hidden', timeout: 5000 });
                } catch (e) {
                    console.log('⚠️ El diálogo de edición no se cerró automáticamente');
                    // Intentar cerrar el diálogo principal si aún está abierto
                    const closeButton = editDialog.locator('.ui-dialog-titlebar-close').first();
                    if (await closeButton.isVisible().catch(() => false)) {
                        await closeButton.click();
                    }
                }
                
                console.log(`✅ Pasajero ${i + 1} eliminado`);
                await page.waitForTimeout(500);
                
            } catch (error) {
                console.error(`❌ Error al eliminar pasajero ${i + 1}:`, error.message);
                // Intentar cerrar el diálogo si está abierto
                try {
                    const closeButton = page.locator('.ui-dialog-titlebar-close').first();
                    if (await closeButton.isVisible()) {
                        await closeButton.click();
                    }
                } catch (e) {
                    // Ignorar error al cerrar
                }
            }
        }
        
        console.log('✅ Limpieza de pasajeros completada');
        await takeScreenshot(page, 'clearPassengers-completed');
        
    } catch (error) {
        console.error('❌ Error al limpiar pasajeros:', error.message);
        throw error;
    }
}
