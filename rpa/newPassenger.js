import { takeScreenshot } from './utils/screenshot.js';
import { disableJQueryUIOverlays } from './helpers/utils.js';

/**
 * Abre el modal de nuevo pasajero en iTraffic
 */
export async function newPassenger(page) {
  console.log('📋 Abriendo modal de nuevo pasajero...');

  // 🔥 1) Cerrar modales abiertos (si los hay)
  const openModals = page.locator('.ui-dialog:visible');
  const modalCount = await openModals.count();

  if (modalCount > 0) {
    console.log(`🔒 Cerrando ${modalCount} modal(es) abierto(s)...`);
    for (let i = 0; i < modalCount; i++) {
      try {
        const modal = openModals.nth(i);
        const closeButton = modal.locator('.ui-dialog-titlebar-close').first();
        if (await closeButton.isVisible()) {
          await closeButton.evaluate(el => el.click());
          await page.waitForTimeout(300);
        }
      } catch {}
    }
  }

  // 🔥 2) MATAR overlays (NO esperar)
  await disableJQueryUIOverlays(page);
  await page.waitForTimeout(300);

  // 🔥 3) Ir a pestaña Pasajeros
  const tabPassengers = page.locator('#ui-id-2');
  await tabPassengers.waitFor({ state: 'visible', timeout: 10000 });
  await tabPassengers.evaluate(el => el.click());
  console.log('✅ Pestaña Pasajeros activa');

  await page.waitForTimeout(1200);

  // 🔥 4) Click en "New Pasajero"
  const newPassengerBtn = page
    .locator('div.tool-button.add-button')
 //   .filter({ hasText: 'New Pasajero' })
    .filter({ hasText: 'Nuevo Pasajero' })
    .first();

  await newPassengerBtn.waitFor({ state: 'visible', timeout: 15000 });
  await newPassengerBtn.scrollIntoViewIfNeeded();

  // Click DOM directo (anti overlay)
  await newPassengerBtn.evaluate(el => el.click());

  console.log('🆕 Click en Nuevo Pasajero');
  await page.waitForTimeout(2000);

  await takeScreenshot(page, '14-newPassenger-01-modal-opened');

  // 🔥 5) Esperar campo clave del modal
  const tipoPasajeroField = page.locator(
    'div[id^="s2id_"][id*="RvapaxEditorDialog"][id$="_Idtipopaxe"]'
  );

  await tipoPasajeroField.waitFor({ state: 'visible', timeout: 15000 });

  console.log('✅ Modal "New Pasajero" listo');
}
