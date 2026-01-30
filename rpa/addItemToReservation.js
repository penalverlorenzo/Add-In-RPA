import { takeScreenshot } from "./utils/screenshot.js";
import {
  select2BySearch,
  fillInput,
  fillQuickFilterInput,
  fillQuickFilterDateRange,
  selectQuickFilterSelect2,
  disableJQueryUIOverlays,
  safeDialogClick,
  convertToDDMMYYYY
} from "./helpers/utils.js";
import { selectBestMatchFromTable } from "./helpers/selectMatchFromTable.js";
import { selectAndFillRoomQuantity } from "./helpers/selectAndFillRoomQuantity.js";


function getItemType(itemText) {
  const t = itemText.toLowerCase();
  if (t.includes("hotel")) return "hotel";
  if (t.includes("programa") || t.includes("paquete")) return "programa";
  if (t.includes("eventual")) return "eventual";
  return "servicio";
}


export async function addItemToReservation(page, service, itemText = "Agregar Servicio", passengers = []) {
  console.log(`👤 Procesando item: ${service.servicio || "sin nombre"} para pasajeros: ${JSON.stringify(passengers)}`);

  const itemType = getItemType(itemText);
  console.log(`📋 Tipo detectado: ${itemType}`);

  await disableJQueryUIOverlays(page);

  const addButton = page
    .locator("div.tool-button.add-button")
    .filter({ hasText: itemText })
    .first();

  await addButton.waitFor({ state: "visible", timeout: 15000 });
  await addButton.scrollIntoViewIfNeeded();
  await addButton.evaluate(el => el.click());

  await page.waitForTimeout(1000);
  await takeScreenshot(page, `18-addItem-01-${itemType}`);

  if (service.estado) {
    const estadoSelector =
      'div[id^="s2id_"][id*="Det_rvaEditorDialog"][id*="Estadoope"]';

    await select2BySearch(page, estadoSelector, service.estado);
    await page.waitForTimeout(500);
  }

  if (itemType === "eventual") {
    const eventualSelector = 'div[id^="s2id_"][id*="Ideventual"]';
    await select2BySearch(page, eventualSelector, service.servicio);
  } else {

    let searchSelector;
    let title;

    if (itemType === "hotel") {
      searchSelector = "div.field.Cod_prov";
      title = "Búsqueda de Tarifas de Hoteles";
    } else if (itemType === "programa") {
      searchSelector = "div.field.Idpaquete";
      title = "Búsqueda de Tarifas de Paquetes";
    } else {
      searchSelector = "div.field.Cod_serv";
      title = "Búsqueda de Tarifas de Servicio";
    }

    const searchBtn = page
      .locator(searchSelector)
      .locator(`a.inplace-button[title="${title}"]`)
      .first();

    await searchBtn.waitFor({ state: "visible", timeout: 10000 });
    await searchBtn.evaluate(el => el.click());

    await page.waitForTimeout(1200);

    /* =========================
       FILTROS
    ========================= */

    if (itemType === "servicio") {
      if (service.servicio)
        await fillQuickFilterInput(page, "Servicio", service.servicio, false);
      if (service.proveedor)
        await selectQuickFilterSelect2(page, "ServicioCodigoPrestador", service.proveedor);
      if (service.destino)
        await selectQuickFilterSelect2(page, "ServicioCiudad", service.destino);
      if (service.in)
        await fillQuickFilterDateRange(page, service.in, service.out);
    }

    if (itemType === "hotel") {
      const hotel = service.nombre_hotel || service.servicio;
      if (hotel)
        await fillQuickFilterInput(page, "Hotel", hotel, false);
      if (service.Ciudad)
        await selectQuickFilterSelect2(page, "Hotelciudad", service.Ciudad);
      if (service.in)
        await fillQuickFilterDateRange(page, service.in, service.out);
    }


    if (itemType === "programa") {
      if (service.codigo)
        await fillInput(page, 'input[id*="ppcod_paq"]', service.codigo, false);
      if (service.servicio)
        await fillQuickFilterInput(page, "Paquete", service.servicio, false);
      if (service.destino)
        await selectQuickFilterSelect2(page, "PaqueteCiudad", service.destino);
      if (service.in)
        await fillQuickFilterDateRange(page, service.in, service.out);
    }

    await page.waitForTimeout(1500);

    await selectBestMatchFromTable(page, service, itemType);
  }

    await page.waitForTimeout(1000);
  // Si es un hotel, configurar la cantidad de habitaciones antes de guardar
    await selectAndFillRoomQuantity(page, service, passengers);
    await page.waitForTimeout(1000);

  console.log("💾 Guardando item…");

  await disableJQueryUIOverlays(page);

  const itemDialog = page.locator(
    '.ui-dialog:has(input[id*="Det_rvaEditorDialog"])'
  ).last();
  
  await itemDialog.waitFor({ state: 'visible', timeout: 15000 });
  
  // 🧠 DEBUG útil
  console.log('🪟 Item dialog encontrado');
  
  // 2️⃣ buscar Guardar SOLO ahí
  const saveButton = itemDialog
    .locator('.tool-button.save-and-close-button')
    .filter({ hasText: 'Guardar' })
    .first();
  
  // 3️⃣ esperar presencia real (no strict)
  await saveButton.waitFor({ state: 'attached', timeout: 10000 });
  await saveButton.scrollIntoViewIfNeeded();
  
  // 4️⃣ CLICK DOM (ignora overlays fantasmas)
  await safeDialogClick(page, saveButton);
  
  console.log('💾 Click Guardar ejecutado');
  
  // 5️⃣ esperar cierre REAL del diálogo
  await itemDialog.waitFor({ state: 'hidden', timeout: 15000 });
  
  await takeScreenshot(page, '18-addItem-06-saved');
  
  console.log('✅ Item guardado correctamente');
}
