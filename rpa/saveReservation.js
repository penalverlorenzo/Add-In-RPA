import { takeScreenshot } from "./utils/screenshot.js";

export async function saveReservation(page) {
    // await page.locator('.button-inner', { hasText: 'Guardar' }).click();
    const applyButton = page.locator('.tool-button.apply-changes-button[title="Aplicar cambios"]');
    await applyButton.waitFor({ state: 'visible', timeout: 10000 });
    await applyButton.click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '17-saveReservation-01-saved');
    console.log('✅ Reserva guardada');
}
