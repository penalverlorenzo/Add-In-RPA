export async function verifyFirstReservation(page, expectedPassengerName) {
  console.log('🔎 Verificando primera reserva en la grilla...');

  // Esperar a que la grilla exista
  await page.waitForSelector('.slick-row', { timeout: 15000 });

  // Tomar la primera fila
  const firstPassengerName = await page.evaluate(() => {
    const firstRow = document.querySelector('.slick-row');
    if (!firstRow) return null;

    const passengerCell = firstRow.querySelector('.slick-cell.l5');
    return passengerCell?.innerText.trim() || null;
  });

  if (!firstPassengerName) {
    throw new Error('❌ No se pudo leer el nombre del pasajero en la primera fila');
  }

  console.log(`🧾 Pasajero en primera fila: "${firstPassengerName}"`);
  console.log(`🎯 Pasajero esperado: "${expectedPassengerName}"`);

  const normalizedGrid = firstPassengerName.toLowerCase();
  const normalizedExpected = expectedPassengerName.toLowerCase();

  if (!normalizedGrid.includes(normalizedExpected)) {
    throw new Error(
      `❌ La primera reserva NO coincide.
      Esperado: "${expectedPassengerName}"
      Encontrado: "${firstPassengerName}"`
    );
  }

  console.log('✅ La primera reserva coincide con el pasajero ingresado');
  return true;
}
