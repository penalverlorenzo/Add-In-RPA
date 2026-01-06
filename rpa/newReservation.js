import { takeScreenshot } from "./utils/screenshot.js";
import { dataReservation } from "./dataReservation.js";

/**
 * Abre el modal de nueva reserva y llena el formulario
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} reservationData - Datos de la reserva (opcional)
 */
export async function newReservation(page, reservationData = null) {
    const newReservationBtnModal = page.locator('div.tool-button.add-button', { hasText: 'New Reserva' });
    await newReservationBtnModal.waitFor({ state: 'visible', timeout: 10000 });
    
    await newReservationBtnModal.click();
    
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '8.1-newReservation-01-modal-opened');

    // Llenar formulario de reserva (pasar los datos si existen)
    await dataReservation(page, reservationData);
}

