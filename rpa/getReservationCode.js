/**
 * Obtiene el código de la reserva desde el input del formulario
 * @param {import('playwright').Page} page - Página de Playwright
 * @returns {Promise<string|null>} Código de la reserva o null si no se encuentra
 */
export async function getReservationCode(page) {
    try {
        // Importar función para deshabilitar overlays
        const { disableJQueryUIOverlays } = await import('./helpers/utils.js');
        
        // Esperar un momento para que el código se genere después de guardar
        await page.waitForTimeout(500);
        
        // Deshabilitar overlays que puedan estar bloqueando
        await disableJQueryUIOverlays(page);
        await page.waitForTimeout(200);
        
        // Hacer click en la pestaña "Reserva" para asegurarse de estar en la pestaña correcta
        const reservaTab = page.locator('li.ui-tabs-tab a.ui-tabs-anchor span:has-text("Reserva")').first();
        try {
            await reservaTab.waitFor({ state: 'visible', timeout: 3000 });
            // Deshabilitar overlays nuevamente antes del click
            await disableJQueryUIOverlays(page);
            await page.waitForTimeout(200);
            // Usar evaluate para hacer click directamente en el DOM, evitando overlays
            await reservaTab.evaluate(el => el.click());
            console.log('✅ Click realizado en la pestaña "Reserva"');
            await page.waitForTimeout(500); // Esperar a que la pestaña se active
        } catch (tabError) {
            console.log('⚠️ No se pudo hacer click en la pestaña "Reserva", continuando...', tabError.message);
            // Continuar de todas formas, puede que ya esté en la pestaña correcta
        }
        
        // Deshabilitar overlays nuevamente antes de buscar el input
        await disableJQueryUIOverlays(page);
        await page.waitForTimeout(200);
        
        // Buscar el input del código de reserva
        // El ID puede variar (ej: Softur_Serene_E_Ventas_ReservaDialog22_Rva o Softur_Serene_E_Ventas_ReservaDialog955_Rva)
        // Usar un selector más flexible que busque por el atributo name o por el patrón del ID
        const codeInput = page.locator('input[name="Rva"][id*="ReservaDialog"][id*="_Rva"]').first();
        
        // Esperar a que el input esté visible (no hidden)
        await codeInput.waitFor({ state: 'visible', timeout: 5000 });
        
        // Esperar a que el input tenga un valor (puede tardar un momento en generarse)
        let code = '';
        let attempts = 0;
        const maxAttempts = 5; // Reducir intentos de 10 a 5
        
        while (attempts < maxAttempts && (!code || code.trim() === '')) {
            code = await codeInput.inputValue();
            if (!code || code.trim() === '') {
                await page.waitForTimeout(300);
                attempts++;
            }
        }
        
        if (code && code.trim() !== '') {
            console.log(`✅ Código de reserva obtenido: ${code.trim()}`);
            return code.trim();
        } else {
            console.log('⚠️ El input del código está vacío después de múltiples intentos');
            return null;
        }
    } catch (error) {
        console.error('❌ Error al obtener el código de reserva:', error.message);
        return null;
    }
}
