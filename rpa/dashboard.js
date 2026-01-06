// rpa/dashboard.js
import 'dotenv/config';
import { takeScreenshot } from './utils/screenshot.js';

export async function navigateToDashboard(page) {
  // Esperar que el dashboard esté completamente cargado
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
  } catch (e) {
    await page.waitForTimeout(4000);
  }

  await takeScreenshot(page, '6-dashboard-01-loaded');

  // Localizar botón "Nueva Reserva"
  const goToNewReservationBtn = page.locator('a[href="/iTraffic_Aymara/E_Ventas/Reserva"]', { hasText: 'New reservation' });

  await goToNewReservationBtn.waitFor({ state: 'visible', timeout: 10000 });

  // Click en el botón
  await goToNewReservationBtn.click();

  // Esperar que cargue la página de reservas
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  await takeScreenshot(page, '7-newReservation-01-page');
}

