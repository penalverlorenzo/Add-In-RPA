import { fillInput } from "./helpers/utils.js";

/**
 * Verifica que un código de reserva existe en iTraffic buscándolo en la tabla de reservas
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string} code - Código de reserva a verificar
 * @returns {Promise<boolean>} true si el código existe, false si no existe o hay error
 */
export async function verifyReservationCodeExists(page, code) {
    try {
        if (!code || typeof code !== 'string' || code.trim() === '') {
            console.log('⚠️ Código de reserva inválido para verificar');
            return false;
        }

        console.log(`🔍 Verificando que el código de reserva existe: ${code}`);

        // Esperar a que la página de reservas esté cargada
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(300);

        // Buscar el input de filtro rápido por código
        const codigoInput = page.locator('#Softur_Serene_E_Ventas_ReservaGrid0_QuickFilter_Rva');
        
        try {
            await codigoInput.waitFor({ state: 'visible', timeout: 5000 });
        } catch (e) {
            console.log('⚠️ No se pudo encontrar el input de filtro de código');
            return false;
        }
        
        // Limpiar el input primero
        await codigoInput.clear();
        await page.waitForTimeout(200);
        
        // Llenar el input con el código
        await fillInput(page, codigoInput, code, false);
        await page.waitForTimeout(500); // Esperar a que se filtren los resultados
        
        // Buscar la fila que contiene el código en la segunda columna
        // Solo verificar que existe el link/ancla, SIN hacer click para no bloquear la reserva
        const codigoLink = page.locator(
            `div.slick-row div.slick-cell.l1.r1 a.s-Serene-E_Ventas-ReservaLink:has-text("${code}")`
        ).first();
        
        try {
            // Solo verificar que el link existe y es visible (sin hacer click)
            const isVisible = await codigoLink.isVisible({ timeout: 3000 });
            if (isVisible) {
                console.log(`✅ Código de reserva verificado: ${code} existe en iTraffic (sin bloquear la reserva)`);
                return true;
            } else {
                console.log(`❌ Código de reserva no encontrado: ${code} no existe en iTraffic`);
                return false;
            }
        } catch (e) {
            // Si no aparece el link, el código no existe
            console.log(`❌ Código de reserva no encontrado: ${code} no existe en iTraffic`);
            return false;
        }
    } catch (error) {
        console.error('❌ Error al verificar código de reserva:', error.message);
        // En caso de error (timeout, etc.), retornar false para ser conservador
        return false;
    }
}
