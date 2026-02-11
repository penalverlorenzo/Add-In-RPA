import { select2BySearch, fillInput, convertToDDMMYYYY } from './helpers/utils.js';
import { takeScreenshot } from './utils/screenshot.js';

/**
 * Llena los datos de un pasajero en el formulario de iTraffic
 * @param {import('playwright').Page} page - Instancia de la página de Playwright
 * @param {Object} passengerData - Datos del pasajero
 * @param {string} passengerData.paxType - Tipo de pasajero (ADU, CHD, INF)
 * @param {string} passengerData.lastName - Apellido del pasajero
 * @param {string} passengerData.firstName - Nombre del pasajero
 * @param {string} passengerData.birthDate - Fecha de nacimiento (MM/DD/YYYY)
 * @param {string} passengerData.nationality - Nacionalidad
 * @param {string} passengerData.sex - Sexo (M, F, O)
 * @param {string} passengerData.documentNumber - Número de documento
 * @param {string} passengerData.cuilCuit - CUIL/CUIT
 * @param {string} passengerData.direccion - Dirección
 */
export async function dataPassenger(page, passengerData) {
  console.log('📝 Llenando datos del pasajero...');
  console.log('Datos recibidos:', JSON.stringify(passengerData, null, 2));

  // Tipo de pasajero (obligatorio) - Seleccionar el div de Select2 (s2id_)
  await select2BySearch(page, 'div[id^="s2id_"][id*="RvapaxEditorDialog"][id$="_Idtipopaxe"]', passengerData.paxType);
  console.log(`✅ Tipo de pasajero: ${passengerData.paxType}`);

  // Apellido (obligatorio)
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Apellido"]', passengerData.lastName);
  console.log(`✅ Apellido: ${passengerData.lastName}`);

  // Nombre (obligatorio)
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Nombre1"]', passengerData.firstName);
  console.log(`✅ Nombre: ${passengerData.firstName}`);

  // Fecha de nacimiento (obligatorio)
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Fec_nac"]', convertToDDMMYYYY(passengerData.birthDate), true);
  console.log(`✅ Fecha de nacimiento: ${convertToDDMMYYYY(passengerData.birthDate)}`);

  // Nacionalidad (obligatorio)
  await select2BySearch(page, 'div[id^="s2id_"][id*="PasajeroWidgetEditor"][id$="__Pasajero_Nacion"]', passengerData.nationality);
  console.log(`✅ Nacionalidad: ${passengerData.nationality}`);

  // Sexo (obligatorio)
  await select2BySearch(page, 'div[id^="s2id_"][id*="PasajeroWidgetEditor"][id$="__Pasajero_Sexo"]', passengerData.sex);
  console.log(`✅ Sexo: ${passengerData.sex}`);
  await takeScreenshot(page, '15-dataPassenger-01-form-filled');

  // Número de documento (obligatorio)
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Nro_doc"]', passengerData.documentNumber);
  console.log(`✅ Número de documento: ${passengerData.documentNumber}`);

  // CUIL/CUIT (obligatorio)
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Nro_Cuit"]', passengerData.cuilCuit);
  console.log(`✅ CUIL/CUIT: ${passengerData.cuilCuit}`);

  // Teléfono celular (obligatorio)
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Cel_Tel"]', passengerData.telefono || '');
  console.log(`✅ Teléfono: ${passengerData.telefono || 'N/A'}`);

  // Dirección (obligatorio) - Eliminar comas y truncar a 40 caracteres máximo si es necesario
  const maxDireccionLength = 40;
  let direccionToUse = passengerData.direccion || '';
  const originalDireccion = direccionToUse;
  
  // Paso 1: Eliminar todas las comas (sin importar dónde estén)
  direccionToUse = direccionToUse.replace(/,/g, '');
  
  // Paso 2: Si aún excede el límite, truncar
  if (direccionToUse.length > maxDireccionLength) {
    const beforeTruncate = direccionToUse;
    direccionToUse = direccionToUse.substring(0, maxDireccionLength);
    console.log(`⚠️ Dirección procesada:`);
    console.log(`   Original: "${originalDireccion}" (${originalDireccion.length} caracteres)`);
    console.log(`   Después de eliminar comas: "${beforeTruncate}" (${beforeTruncate.length} caracteres)`);
    console.log(`   Truncada: "${direccionToUse}" (${direccionToUse.length} caracteres)`);
  } else if (originalDireccion !== direccionToUse) {
    console.log(`ℹ️ Dirección limpiada (sin truncar):`);
    console.log(`   Original: "${originalDireccion}" (${originalDireccion.length} caracteres)`);
    console.log(`   Sin comas: "${direccionToUse}" (${direccionToUse.length} caracteres)`);
  }
  
  await fillInput(page, 'input[id*="PasajeroWidgetEditor"][id$="__Pasajero_Direccion"]', direccionToUse);
  console.log(`✅ Dirección: ${direccionToUse}`);

  await takeScreenshot(page, '16-dataPassenger-02-form-filled');
  console.log('✅ Datos del pasajero completados');

  const modalContent = page.locator('.ui-dialog-content:visible').first();
  await modalContent.evaluate(el => el.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // const modal = page.locator('.ui-dialog:has(.ui-dialog-title:text("New Pasajero"))');
   const modal = page.locator('.ui-dialog:has(.ui-dialog-title:text("Nuevo Pasajero"))');
  await modal.locator('.tool-button.save-and-close-button', { hasText: 'Guardar' }).click();
  
  // Esperar a que el modal se cierre completamente
  await page.waitForTimeout(500);
  
  // Verificar que el modal se haya cerrado
  try {
    await modal.waitFor({ state: 'hidden', timeout: 3000 });
    console.log(`✅ Pasajero ${passengerData.lastName} agregado y guardado.`);
  } catch (error) {
    console.log(`⚠️ Pasajero guardado, pero el modal no se cerró como se esperaba`);
  }
  
  await takeScreenshot(page, '17-dataPassenger-03-form-saved');
}
