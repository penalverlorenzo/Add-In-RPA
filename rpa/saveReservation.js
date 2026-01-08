import { takeScreenshot } from "./utils/screenshot";

export async function saveReservation(page) {
    await page.locator('.button-inner', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '17-saveReservation-01-saved');
    console.log('✅ Reserva guardada');
}
