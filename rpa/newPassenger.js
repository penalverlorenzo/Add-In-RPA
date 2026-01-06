import { takeScreenshot } from './utils/screenshot.js';

/**
 * Abre el modal de nuevo pasajero en iTraffic
 * @param {import('playwright').Page} page - Instancia de la página de Playwright
 */
export async function newPassenger(page) {
  console.log('📋 Abriendo modal de nuevo pasajero...');

  // Cerrar cualquier diálogo modal que pueda estar abierto
  try {
    const closeButton = page.locator('.ui-dialog-titlebar-close').first();
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
      console.log('✅ Modal previo cerrado');
      await page.waitForTimeout(500); // Esperar a que se cierre completamente
    }
  } catch (error) {
    console.log('ℹ️ No hay modal previo para cerrar');
  }

  // Hacer clic en la pestaña de Pasajeros usando force: true para evitar interceptación
  const tabPassengers = page.locator('#ui-id-2');
  await tabPassengers.waitFor({ state: 'visible' });
  await tabPassengers.click({ force: true });
  console.log('✅ Pestaña Pasajeros activa.');
  
  await page.waitForTimeout(1000); // Esperar a que cargue la pestaña

  // Hacer clic en el botón "New Pasajero"
  const newPassengersBtnModal = page.locator('div.tool-button.add-button', { hasText: 'New Pasajero' });
  await newPassengersBtnModal.waitFor({ state: 'visible' });
  await newPassengersBtnModal.click();
  
  // Esperar a que el modal se abra
  await page.waitForTimeout(2000);
  
  // Tomar captura inmediatamente después de abrir
  await takeScreenshot(page, '14-newPassenger-01-modal-opened');
  
  // Verificar que el campo de tipo de pasajero esté visible antes de continuar (seleccionar el div de Select2)
  const tipoPasajeroField = page.locator('div[id^="s2id_"][id*="RvapaxEditorDialog"][id$="_Idtipopaxe"]');
  
  try {
    await tipoPasajeroField.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Modal "New Pasajero" abierto y campos listos.');
  } catch (error) {
    console.log('⚠️ Campo de tipo pasajero no visible, guardando HTML para debug...');
    
    // Guardar HTML para inspección
    const htmlContent = await page.content();
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const screenshotsDir = path.join(__dirname, '..', 'screenshots');
    
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(screenshotsDir, 'debug-modal-not-ready.html'), htmlContent);
    console.log('✅ HTML guardado en screenshots/debug-modal-not-ready.html');
    
    throw error; // Re-lanzar el error
  }
}

