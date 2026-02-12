/**
 * Verifica si aparece un diálogo de alerta sobre truncamiento de datos en Nro_vuelo
 * @param {import('playwright').Page} page - Instancia de la página de Playwright
 * @returns {Promise<boolean>} true si hay un diálogo de alerta sobre Nro_vuelo
 */
export async function checkForFlightNumberAlert(page) {
  try {
      // Esperar un momento para que el diálogo aparezca si va a aparecer
      await page.waitForTimeout(500);
      
      // Buscar el diálogo de alerta
      const alertDialog = page.locator('.ui-dialog.s-AlertDialog:has(.ui-dialog-title:has-text("Alerta"))');
      const isVisible = await alertDialog.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (isVisible) {
          // Leer el mensaje del diálogo
          const message = await alertDialog.locator('.message').textContent().catch(() => '');
          console.log(`⚠️ Diálogo de alerta detectado: ${message}`);
          
          // Verificar si el mensaje contiene información sobre Nro_vuelo truncado
          if (message && (message.includes("Nro_vuelo") || message.includes("Truncated value"))) {
              // Cerrar el diálogo haciendo clic en OK
              try {
                  const okButton = alertDialog.locator('button:has-text("OK")').first();
                  await okButton.waitFor({ state: 'visible', timeout: 2000 });
                  await okButton.click();
                  await page.waitForTimeout(200);
                  // Esperar a que el diálogo se cierre
                  await alertDialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
              } catch (e) {
                  // Si no se puede cerrar, intentar cerrar con el botón X
                  try {
                      const closeButton = alertDialog.locator('.ui-dialog-titlebar-close').first();
                      if (await closeButton.isVisible().catch(() => false)) {
                          await closeButton.click();
                          await page.waitForTimeout(200);
                      }
                  } catch (e2) {
                      // Ignorar errores al cerrar
                  }
              }
              
              return true;
          }
      }
      return false;
  } catch (error) {
      return false;
  }
}
