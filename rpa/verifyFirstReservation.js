export async function verifyFirstReservation(page, expectedPassengerName) {
  console.log('🔎 Verificando primera reserva en la grilla...');

  // Esperar a que la grilla exista
  await page.waitForSelector('.slick-row', { timeout: 15000 });
  await page.locator('#slickgrid_346395Idreserva').first().click();
  // Tomar la primera fila
  const firstPassengerName = await page.evaluate(() => {
    const firstRow = document.querySelector('.slick-row');
    if (!firstRow) return null;

    const passengerCell = firstRow.querySelector('.slick-cell.l5');
    return passengerCell?.innerText.trim() || null;
  });
  const firstReservationId = await page.evaluate(() => {
    const firstRow = document.querySelector('.slick-row');
    if (!firstRow) return null;

    const reservationIdCell = firstRow.querySelector('.slick-cell.l0');
    return reservationIdCell?.innerText.trim() || null;
  });

  if (!firstPassengerName || !firstReservationId) {
    throw new Error('❌ No se pudo leer el nombre del pasajero o el ID de la reserva en la primera fila');
  }
  console.log(`🧾 ID de la reserva en primera fila: "${firstReservationId}"`);
  console.log(`🧾 Pasajero en primera fila: "${firstPassengerName}"`);
  console.log(`🎯 Pasajero esperado: "${expectedPassengerName}"`);
  if (reservationId <= 1){
    await page.locator('#slickgrid_346395Idreserva').first().click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '18-verifyFirstReservation-01-reservation-id-clicked-' + firstReservationId);
  }
  await page.waitForTimeout(1000);
  const normalizedGrid = firstPassengerName.toLowerCase();
  const normalizedExpected = expectedPassengerName.toLowerCase();

  if (!normalizedGrid.includes(normalizedExpected)) {
    console.error(
      `❌ La primera reserva NO coincide.
      Esperado: "${expectedPassengerName}"
      Encontrado: "${firstPassengerName}"`
    );
    return false;
  }

  console.log('✅ La primera reserva coincide con el pasajero ingresado');
  return true;
}
