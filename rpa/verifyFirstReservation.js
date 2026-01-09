import { takeScreenshot } from "./utils/screenshot.js";

export async function verifyFirstReservation(page, expectedPassengerName) {
  console.log('🔎 Verificando primera reserva en la grilla...');

  // Esperar a que la grilla exista
  await page.waitForSelector('.slick-row', { timeout: 15000 });
  await page.locator('.slick-header-column').filter({ hasText: 'Id' }).first().click();

  const firstReservationId = await page.evaluate(() => {
    const firstRow = document.querySelector('.slick-row');
    if (!firstRow) return null;

    const reservationIdCell = firstRow.querySelector('.slick-cell.l0');
    return reservationIdCell?.innerText.trim() || null;
  });

  if (firstReservationId <= 1){
    await page.locator('.slick-header-column').filter({ hasText: 'Id' }).first().click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '18-verifyFirstReservation-01-reservation-id-clicked-' + firstReservationId);
  }
  await page.waitForTimeout(1000);

  // Tomar la primera fila
  const firstPassengerName = await page.evaluate(() => {
    const firstRow = document.querySelector('.slick-row');
    if (!firstRow) return null;

    const passengerCell = firstRow.querySelector('.slick-cell.l5');
    return passengerCell?.innerText.trim() || null;
  });
  if (!firstPassengerName || !firstReservationId) {
    throw new Error('❌ No se pudo leer el nombre del pasajero o el ID de la reserva en la primera fila');
  }
  const normalizedGrid = firstPassengerName.toLowerCase();
  const normalizedExpected = expectedPassengerName.map(name => name.toLowerCase());
  await takeScreenshot(page, '18-verifyFirstReservation-02-normalized-grid-compared');
  console.log(`🧾 ID de la reserva en primera fila: "${firstReservationId}"`);
  console.log(`🧾 Pasajero en primera fila: "${firstPassengerName}"`);
  console.log(`🎯 Pasajero esperado: "${expectedPassengerName[0]},${expectedPassengerName[1]}"`);
  if (!normalizedGrid.includes(normalizedExpected[0]) && !normalizedGrid.includes(normalizedExpected[1])) {
    console.error(
      `❌ La primera reserva NO coincide.
      Esperado: "${expectedPassengerName[0]} o ${expectedPassengerName[1]}"
      Encontrado: "${firstPassengerName}"`
    );
    return false;
  }
  await takeScreenshot(page, '18-verifyFirstReservation-03-normalized-grid-compared-success');

  console.log('✅ La primera reserva coincide con el pasajero ingresado');
  return true;
}
