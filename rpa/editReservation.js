import { takeScreenshot } from "./utils/screenshot.js";
import { fillInput } from "./helpers/utils.js";

/**
 * Busca una reserva por código y la selecciona para editar
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} reservationData - Datos de la reserva que debe contener el código (codigo o reservationCode)
 */
export async function editReservation(page, reservationData = null) {
    // El código puede venir como 'codigo' o 'reservationCode'
    const codigo = reservationData?.codigo || reservationData?.reservationCode;
    
    if (!codigo) {
        throw new Error('reservationData.codigo or reservationData.reservationCode is required to edit a reservation');
    }

    console.log(`🔍 Buscando reserva con código: ${codigo}`);

    // Esperar a que la página de reservas esté cargada
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'editReservation-01-page-loaded');

    // Buscar el input de filtro rápido por código
    const codigoInput = page.locator('#Softur_Serene_E_Ventas_ReservaGrid0_QuickFilter_Rva');
    await codigoInput.waitFor({ state: 'visible', timeout: 10000 });
    
    // Llenar el input con el código
    await fillInput(page, codigoInput, codigo, false);
    await takeScreenshot(page, 'editReservation-02-codigo-filled');
    
    // Esperar a que se filtren los resultados (la tabla se actualiza)
    await page.waitForTimeout(2000);
    
    // Buscar la fila que contiene el código en la segunda columna
    // El código está en un link dentro de la segunda columna (l1 r1)
    // Usar un selector más flexible que busque el texto exacto
    const codigoLink = page.locator(
        `div.slick-row div.slick-cell.l1.r1 a.s-Serene-E_Ventas-ReservaLink`
    ).filter({ hasText: codigo });
    
    // Esperar a que aparezca el link con el código
    try {
        await codigoLink.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`✅ Reserva encontrada con código: ${codigo}`);
        await takeScreenshot(page, 'editReservation-03-reservation-found');
        
        // Hacer click en el link del código para abrir la reserva
        await codigoLink.click();
        console.log(`✅ Click realizado en el código de la reserva`);
        
        // Esperar a que se abra el modal/diálogo de edición
        // El modal debería aparecer después del click
        await page.waitForTimeout(3000);
        
        // Verificar que el modal se abrió (buscar algún elemento del modal)
        const modal = page.locator('.ui-dialog:visible, div[class*="Dialog"]:visible').first();
        try {
            await modal.waitFor({ state: 'visible', timeout: 5000 });
            console.log('✅ Modal de edición abierto');
        } catch (e) {
            console.log('⚠️ No se detectó modal visible, pero continuando...');
        }
        
        await takeScreenshot(page, 'editReservation-04-reservation-opened');
        
    } catch (error) {
        console.error(`❌ No se encontró la reserva con código: ${codigo}`);
        console.error('   Error:', error.message);
        
        // Intentar buscar todas las filas disponibles para debug
        const allRows = page.locator('div.slick-row');
        const rowCount = await allRows.count();
        console.log(`   Filas encontradas en la tabla: ${rowCount}`);
        
        if (rowCount > 0) {
            // Mostrar los códigos de las primeras filas para debug
            for (let i = 0; i < Math.min(rowCount, 5); i++) {
                const row = allRows.nth(i);
                const codigoCell = row.locator('div.slick-cell.l1.r1 a');
                if (await codigoCell.count() > 0) {
                    const codigoText = await codigoCell.textContent();
                    console.log(`   Fila ${i + 1} código: ${codigoText}`);
                }
            }
        }
        
        await takeScreenshot(page, 'editReservation-error-not-found');
        throw new Error(`Reservation with code "${codigo}" not found`);
    }
}
