/**
 * Selecciona el mejor match de la tabla de resultados y hace click en OK
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} service - Datos del servicio/hotel/programa
 * @param {string} itemType - Tipo de item: 'hotel', 'servicio', 'programa'
 */
export async function selectBestMatchFromTable(page, service, itemType) {
  console.log(`🔍 Buscando mejor coincidencia en la tabla para ${itemType}...`, service);
  
  // Buscar el botón OK del diálogo de búsqueda de tarifas
  // Este es el diálogo que se abre después del botón de búsqueda
  const okButton = page.locator('div.ui-dialog-buttonset button:has-text("OK")').first();
  await okButton.waitFor({ state: 'visible', timeout: 10000 });
  
  // Encontrar el diálogo que contiene este botón OK usando evaluateHandle
  const dialog = page.locator('div.ui-dialog:visible').filter({ has: okButton }).first();

  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  
  await page.waitForTimeout(1500); // Dar tiempo para que se carguen los resultados
  
  // Buscar la tabla dentro del diálogo - usar el grid-canvas que contiene las filas de datos
  // El grid-canvas-top-grid-canvas-left es el que contiene las filas principales
  // Buscar dentro del contenido del diálogo específicamente
  const dialogContent = dialog.locator('.ui-dialog-content');
  const tableContainer = dialogContent.locator('.grid-canvas.grid-canvas-top.grid-canvas-left').first();

  console.log("Existe tableContainer? Su valor: ", await tableContainer.isVisible());
  // Obtener todas las filas dentro del grid-canvas del diálogo (excluyendo las filas de grupo)
  // Buscar las filas dentro del grid-canvas específico del diálogo
  await page.waitForTimeout(10000);
  const rows = tableContainer.locator('div.ui-widget-content.slick-row:not(.slick-group)');
  const rowCount = await rows.count();
  
  console.log(`📊 Encontradas ${rowCount} filas en la tabla`);
  
  if (rowCount === 0) {
      console.log('⚠️ No se encontraron resultados en la tabla');
      // Hacer click en Cancelar si no hay resultados
      const cancelButton = dialog.locator('div.ui-dialog-buttonset button:has-text("Cancel")');
      if (await cancelButton.count() > 0) {
          await cancelButton.click();
          await page.waitForTimeout(500);
      }
      return;
  }
  
  let bestMatch = null;
  let bestScore = 0;
  let bestRowIndex = -1;
  
  // Analizar cada fila
  for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      let rowData = {};
      
      try {
          if (itemType === 'hotel') {
              // Hotel según SelectableOptions.txt: l0=Nombre hotel, l1=Ciudad, l3=Fecha desde, l4=Fecha hasta, l5=Tipo habitación, l9=Categoría
              rowData = {
                  nombre_hotel: await getCellText(row, 0),
                  ciudad: await getCellText(row, 1),
                  fechaDesde: await getCellText(row, 3),
                  fechaHasta: await getCellText(row, 4),
                  tipo_habitacion: await getCellText(row, 5),
                  categoria: await getCellText(row, 9)
              };
          } else if (itemType === 'servicio') {
              // Servicio según SelectableOptions.txt: l0=Nombre servicio, l1=Proveedor, l2=Ciudad, l4=Fecha desde, l5=Fecha hasta
              rowData = {
                  servicio: await getCellText(row, 0),
                  proveedor: await getCellText(row, 1),
                  ciudad: await getCellText(row, 2),
                  fechaDesde: await getCellText(row, 4),
                  fechaHasta: await getCellText(row, 5)
              };
          } else if (itemType === 'programa') {
              // Programa según SelectableOptions.txt: l0=Código, l2=Proveedor, l5=Fecha desde, l6=Fecha hasta, l9=Categoría
              // El nombre del programa puede estar en el grupo (slick-group-title) o ser el mismo código
              rowData = {
                  codigo: await getCellText(row, 0),
                  proveedor: await getCellText(row, 2),
                  fechaDesde: await getCellText(row, 5),
                  fechaHasta: await getCellText(row, 6),
                  categoria: await getCellText(row, 9)
              };
              // Intentar obtener el nombre del grupo si existe
              // Buscar el grupo más cercano antes de esta fila dentro del mismo grid-canvas
              try {
                  const allGroups = tableContainer.locator('div.slick-row.slick-group');
                  const groupCount = await allGroups.count();
                  let foundGroup = false;
                  
                  // Buscar el grupo que está antes de esta fila
                  for (let g = 0; g < groupCount; g++) {
                      const group = allGroups.nth(g);
                      const groupIndex = await group.evaluate(el => {
                          const parent = el.parentElement;
                          return Array.from(parent.children).indexOf(el);
                      });
                      const rowIndex = await row.evaluate(el => {
                          const parent = el.parentElement;
                          return Array.from(parent.children).indexOf(el);
                      });
                      
                      if (groupIndex < rowIndex) {
                          const groupTitle = await group.locator('.slick-group-title').textContent();
                          if (groupTitle && groupTitle.trim() !== 'undefined') {
                              rowData.servicio = groupTitle.trim();
                              foundGroup = true;
                              break;
                          }
                      }
                  }
                  
                  if (!foundGroup) {
                      // Si no hay grupo, usar el código como nombre
                      rowData.servicio = rowData.codigo;
                  }
              } catch (e) {
                  // Si hay error, usar el código como nombre
                  rowData.servicio = rowData.codigo;
              }
          }
          
          const score = calculateMatchScore(rowData, service, itemType);
          console.log(`  Fila ${i + 1}: Score ${score.toFixed(2)}% - ${JSON.stringify(rowData)}`);
          
          if (score > bestScore) {
              bestScore = score;
              bestMatch = rowData;
              bestRowIndex = i;
          }
      } catch (error) {
          console.log(`  ⚠️ Error procesando fila ${i + 1}:`, error.message);
      }
  }
  
  if (bestRowIndex >= 0 && bestScore > 30) { // Solo seleccionar si el score es razonable
      console.log(`✅ Mejor coincidencia encontrada en fila ${bestRowIndex + 1} con score ${bestScore.toFixed(2)}%`);
      const bestRow = rows.nth(bestRowIndex);
      
      // Hacer click en la fila para seleccionarla
      await bestRow.click();
      await page.waitForTimeout(500);
      
      // Hacer click en el botón OK dentro del diálogo (usar el mismo okButton que encontramos al inicio)
      await okButton.click();
      console.log(`✅ Fila seleccionada y modal cerrado`);
  } else {
      console.log(`⚠️ No se encontró una coincidencia suficientemente buena (mejor score: ${bestScore.toFixed(2)}%)`);
      // Si no hay buena coincidencia, seleccionar la primera fila por defecto
      if (rowCount > 0) {
          console.log(`📌 Seleccionando primera fila por defecto`);
          await rows.first().click();
          await page.waitForTimeout(500);
          await okButton.click();
          await page.waitForTimeout(1000);
          console.log(`✅ Primera fila seleccionada y modal cerrado`);
      } else {
          // Si no hay filas, hacer click en Cancelar
          console.log(`⚠️ No hay filas disponibles, cerrando modal`);
          const cancelButton = dialog.locator('div.ui-dialog-buttonset button:has-text("Cancelar")');
          if (await cancelButton.count() > 0) {
              await cancelButton.click();
              await page.waitForTimeout(500);
          }
      }
  }
}

/**
 * Calcula el score de coincidencia entre una fila de la tabla y los datos del servicio
 * @param {Object} rowData - Datos extraídos de la fila
 * @param {Object} serviceData - Datos del servicio recibido
 * @param {string} itemType - Tipo de item: 'hotel', 'servicio', 'programa'
 * @returns {number} Score de coincidencia (0-100)
 */
function calculateMatchScore(rowData, serviceData, itemType) {
  let score = 0;
  let maxScore = 0;

  if (itemType === 'hotel') {
      // Nombre del hotel - usar nombre_hotel o servicio como fallback
      const hotelName = serviceData.nombre_hotel || serviceData.servicio;
      if (hotelName && rowData.nombre_hotel) {
          maxScore += 40;
          const serviceName = hotelName.toLowerCase();
          const rowName = rowData.nombre_hotel.toLowerCase();
          if (rowName.includes(serviceName) || serviceName.includes(rowName)) {
              score += 40;
          } else if (serviceName.split(' ').some(word => rowName.includes(word) && word.length > 3)) {
              score += 20;
          }
      }

      // Tipo de habitación
      if (serviceData.tipo_habitacion && rowData.tipo_habitacion) {
          maxScore += 30;
          if (serviceData.tipo_habitacion === rowData.tipo_habitacion) {
              score += 30;
          }
      }

      // Ciudad - usar Ciudad o destino como fallback
      const ciudad = serviceData.Ciudad || serviceData.destino;
      if (ciudad && rowData.ciudad) {
          maxScore += 20;
          const serviceCity = ciudad.toLowerCase();
          const rowCity = rowData.ciudad.toLowerCase();
          if (serviceCity === rowCity || serviceCity.includes(rowCity) || rowCity.includes(serviceCity)) {
              score += 20;
          }
      }

      // Categoría
      if (serviceData.Categoria && rowData.categoria) {
          maxScore += 10;
          const serviceCat = serviceData.Categoria.toLowerCase();
          const rowCat = rowData.categoria.toLowerCase();
          if (rowCat.includes(serviceCat) || serviceCat.includes(rowCat)) {
              score += 10;
          }
      }
  } else if (itemType === 'servicio') {
      // Nombre del servicio
      if (serviceData.servicio && rowData.servicio) {
          maxScore += 50;
          const serviceName = serviceData.servicio.toLowerCase();
          const rowName = rowData.servicio.toLowerCase();
          if (rowName.includes(serviceName) || serviceName.includes(rowName)) {
              score += 50;
          } else {
              // Comparar palabras clave
              const serviceWords = serviceName.split(/\s+/);
              const rowWords = rowName.split(/\s+/);
              const commonWords = serviceWords.filter(w => rowWords.includes(w));
              if (commonWords.length > 0) {
                  score += (commonWords.length / serviceWords.length) * 50;
              }
          }
      }

      // Ciudad
      if (serviceData.destino && rowData.ciudad) {
          maxScore += 30;
          const serviceCity = serviceData.destino.toLowerCase();
          const rowCity = rowData.ciudad.toLowerCase();
          if (serviceCity === rowCity || serviceCity.includes(rowCity) || rowCity.includes(serviceCity)) {
              score += 30;
          }
      }

      // Proveedor (si está disponible)
      if (serviceData.proveedor && rowData.proveedor) {
          maxScore += 20;
          const serviceProv = serviceData.proveedor.toLowerCase();
          const rowProv = rowData.proveedor.toLowerCase();
          if (serviceProv === rowProv || rowProv.includes(serviceProv)) {
              score += 20;
          }
      }
  } else if (itemType === 'programa') {
      // Código del paquete
      if (serviceData.codigo && rowData.codigo) {
          maxScore += 40;
          if (serviceData.codigo === rowData.codigo) {
              score += 40;
          }
      }

      // Nombre del paquete
      if (serviceData.servicio && rowData.servicio) {
          maxScore += 40;
          const serviceName = serviceData.servicio.toLowerCase();
          const rowName = rowData.servicio.toLowerCase();
          if (rowName.includes(serviceName) || serviceName.includes(rowName)) {
              score += 40;
          }
      }

      // Ciudad
      if (serviceData.destino && rowData.ciudad) {
          maxScore += 20;
          const serviceCity = serviceData.destino.toLowerCase();
          const rowCity = rowData.ciudad.toLowerCase();
          if (serviceCity === rowCity || serviceCity.includes(rowCity) || rowCity.includes(serviceCity)) {
              score += 20;
          }
      }
  }

  return maxScore > 0 ? (score / maxScore) * 100 : 0;
}
