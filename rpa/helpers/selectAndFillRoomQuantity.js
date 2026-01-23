/**
 * Selecciona y configura la cantidad de habitaciones basándose en el tipo de habitación y pasajeros
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} service - Datos del servicio/hotel (debe tener tipo_habitacion si es hotel)
 * @param {Array} passengers - Array de pasajeros con paxType (ADU, CHD, INF)
 */
export async function selectAndFillRoomQuantity(page, service, passengers = []) {
  console.log('🏨 Configurando cantidad de habitaciones...');
  
  // Contar pasajeros por tipo
  const passengerCounts = {
    ADU: 0,
    CHD: 0,
    INF: 0
  };
  
  if (passengers && passengers.length > 0) {
    passengers.forEach(pax => {
      const paxType = (pax.paxType || pax.passengerType || '').toUpperCase();
      if (passengerCounts.hasOwnProperty(paxType)) {
        passengerCounts[paxType]++;
      } else if (paxType === 'ADU') {
        passengerCounts.ADU++;
      }
    });
  }
  
  console.log(`📊 Pasajeros: ADU=${passengerCounts.ADU}, CHD=${passengerCounts.CHD}, INF=${passengerCounts.INF}`);
  
  // Obtener tipo de habitación del hotel
  const roomType = service.tipo_habitacion ? service.tipo_habitacion.toUpperCase() : null;
  console.log(`🛏️ Tipo de habitación buscado: ${roomType || 'No especificado'}`);
  
  // Buscar la tabla de habitaciones dentro del diálogo del item
  const itemDialog = page.locator('.ui-dialog:has(input[id*="Det_rvaEditorDialog"])').last();
  await itemDialog.waitFor({ state: 'visible', timeout: 10000 });
  
  // Buscar el grid de Det_rvah (tabla de habitaciones)
  const roomGrid = itemDialog.locator('div[id*="Det_rvah"] .grid-canvas.grid-canvas-top.grid-canvas-left').first();
  await roomGrid.waitFor({ state: 'visible', timeout: 10000 });
  
  // Obtener todas las filas de habitaciones (excluyendo grupos)
  const roomRows = roomGrid.locator('div.ui-widget-content.slick-row:not(.slick-group)');
  const rowCount = await roomRows.count();
  
  console.log(`📋 Encontradas ${rowCount} filas de habitaciones`);
  
  if (rowCount === 0) {
    console.log('⚠️ No se encontraron filas de habitaciones');
    return;
  }
  
  let targetRow = null;
  let targetPaxType = 'ADU'; // Por defecto ADU
  
  // Si hay tipo de habitación, buscar la fila que coincida
  if (roomType) {
    for (let i = 0; i < rowCount; i++) {
      const row = roomRows.nth(i);
      const rowRoomType = await getCellText(row, 1); // l1 = Tipo habitación
      const rowPaxType = await getCellText(row, 2); // l2 = Tipo pasajero
      
      if (rowRoomType && rowRoomType.toUpperCase() === roomType) {
        // Encontrar el tipo de pasajero que tenga más cantidad
        if (passengerCounts.ADU > 0) {
          if (rowPaxType && rowPaxType.toUpperCase() === 'ADU') {
            targetRow = row;
            targetPaxType = 'ADU';
            console.log(`✅ Encontrada fila para ${roomType} - ${targetPaxType} (fila ${i + 1})`);
            break;
          }
        } else if (passengerCounts.CHD > 0) {
          if (rowPaxType && rowPaxType.toUpperCase() === 'CHD') {
            targetRow = row;
            targetPaxType = 'CHD';
            console.log(`✅ Encontrada fila para ${roomType} - ${targetPaxType} (fila ${i + 1})`);
            break;
          }
        } else if (passengerCounts.INF > 0) {
          if (rowPaxType && rowPaxType.toUpperCase() === 'INF') {
            targetRow = row;
            targetPaxType = 'INF';
            console.log(`✅ Encontrada fila para ${roomType} - ${targetPaxType} (fila ${i + 1})`);
            break;
          }
        }
      }
    }
  }
  
  // Si no se encontró una fila específica, usar la primera fila disponible
  if (!targetRow) {
    console.log('⚠️ No se encontró fila específica, usando primera fila disponible');
    targetRow = roomRows.first();
    const firstRowPaxType = await getCellText(targetRow, 2);
    targetPaxType = firstRowPaxType ? firstRowPaxType.toUpperCase() : 'ADU';
  }
  
  // Determinar la cantidad basándose en el tipo de pasajero
  let quantity = 0;
  if (targetPaxType === 'ADU' && passengerCounts.ADU > 0) {
    quantity = passengerCounts.ADU;
  } else if (targetPaxType === 'CHD' && passengerCounts.CHD > 0) {
    quantity = passengerCounts.CHD;
  } else if (targetPaxType === 'INF' && passengerCounts.INF > 0) {
    quantity = passengerCounts.INF;
  } else {
    // Si no hay pasajeros del tipo encontrado, usar el total de adultos
    quantity = passengerCounts.ADU || (passengers ? passengers.length : 1);
  }
  
  // Si no hay pasajeros, usar 1 por defecto
  if (quantity === 0) {
    quantity = 1;
    console.log('⚠️ No se encontraron pasajeros, usando cantidad por defecto: 1');
  }
  
  console.log(`📝 Llenando cantidad: ${quantity} para tipo ${targetPaxType}`);
  
  // Buscar el input de cantidad en la fila (l3 = Cantidad)
  const quantityInput = targetRow.locator('div.slick-cell.l3.r3 input[data-field="Cantiphab"]').first();
  
  await quantityInput.waitFor({ state: 'visible', timeout: 5000 });
  await quantityInput.click();
  await page.waitForTimeout(200);
  await quantityInput.fill(String(quantity));
  await page.waitForTimeout(300);
  
  // Presionar Tab para confirmar el cambio
  await quantityInput.press('Tab');
  await page.waitForTimeout(500);
  
  console.log(`✅ Cantidad de habitaciones configurada: ${quantity}`);
}


export async function getCellText(row, cellIndex) {
  try {
    const cell = row.locator(`div.slick-cell.l${cellIndex}.r${cellIndex}`);
    const text = await cell.textContent();
    return (text || "").trim();
  } catch {
    return "";
  }
}
