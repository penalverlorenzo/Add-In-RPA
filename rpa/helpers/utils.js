// rpa/helpers/utils.js

/**
 * Selecciona un valor en un Select2 usando búsqueda
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string} containerSelector - Selector del contenedor Select2
 * @param {string} valueToSelect - Valor a seleccionar
 */
export async function select2BySearch(page, containerSelector, valueToSelect) {
    if (!valueToSelect) {
        return;
    }

    const selectContainer = page.locator(containerSelector);
    // Timeout extendido a 30s para la visibilidad del Select2
    await selectContainer.waitFor({ state: 'visible', timeout: 30000 }); 
    await selectContainer.click();

    const visibleDropdown = page.locator('div.select2-drop:visible');
    const searchInput = visibleDropdown.locator('input.select2-input');

    await searchInput.fill(valueToSelect);
    
    // Esperar un momento para que se filtren los resultados
    await page.waitForTimeout(1000);

    // Tomar el PRIMER resultado disponible (sin importar el texto exacto)
    const resultLocator = visibleDropdown.locator('li.select2-results-dept-0').first();
    
    // Timeout extendido a 30s para esperar el resultado de la búsqueda
    await resultLocator.waitFor({ state: 'visible', timeout: 30000 }); 
    await resultLocator.click();

    await page.waitForTimeout(500);
}

/**
 * Llena un campo de input con scroll automático
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string|import('playwright').Locator} target - Selector del input o locator del elemento
 * @param {string} value - Valor a llenar
 * @param {boolean} isDate - Si es un campo de fecha (presiona Tab después)
 */
export async function fillInput(page, target, value, isDate = false) {
    if (!value) return;
  
    const inputLocator =
      typeof target === 'string' ? page.locator(target) : target;
  
    await inputLocator.waitFor({ state: 'visible', timeout: 60000 });
    await inputLocator.evaluate(el =>
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  
    await inputLocator.fill(value);
  
    if (isDate) {
      await inputLocator.press('Tab');
    }
  
    await page.waitForTimeout(300);
  }
  

/**
 * Llena un campo del filtro rápido (quick-filter) basado en el nombre del campo
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string} fieldName - Nombre del campo (ej: "Servicio", "Hotel", "Proveedor")
 * @param {string} value - Valor a llenar
 * @param {boolean} isDate - Si es un campo de fecha (presiona Tab después)
 */
export async function fillQuickFilterInput(page, fieldName, value, isDate = false) {
    if (!value || !fieldName) {
        return;
    }

    // Construir selector dinámico basado en el patrón: input[id*="{fieldName}Nombre"]
    // Ejemplos:
    // - fieldName: "Servicio" -> selector: 'input[id*="ServicioNombre"]'
    // - fieldName: "Hotel" -> selector: 'input[id*="HotelNombre"]'
    const selector = `input[id*="${fieldName}Nombre"]`;
    
    await fillInput(page, selector, value, isDate);
}

/**
 * Llena un campo de fecha en el filtro rápido (dos inputs: desde y hasta)
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string} fechaDesde - Fecha de inicio en formato YYYY-MM-DD
 * @param {string} fechaHasta - Fecha de fin en formato YYYY-MM-DD (opcional, si no se proporciona usa fechaDesde)
 */
export async function fillQuickFilterDateRange(page, fechaDesde, fechaHasta = null) {
    if (!fechaDesde) return;
  
    const formatDate = (dateStr) => {
      if (!dateStr) return null;
      if (dateStr.includes('/')) return dateStr;
      const [y, m, d] = dateStr.split('-');
      return `${m}/${d}/${y}`;
    };
  
    const desdeFormatted = formatDate(fechaDesde);
    const hastaFormatted = formatDate(fechaHasta || fechaDesde);
    if (!desdeFormatted) return;
  
    // 🔒 Scope al diálogo visible
    const dialog = page.locator('.ui-dialog:visible');
  
    // DESDE
    const desdeInput = dialog.locator(
      'div.quick-filter-item:has(span.quick-filter-label:text("Fecha")) input[id*="FecDesde"]'
    );
  
    await fillInput(page, desdeInput, desdeFormatted, true);
  
    // HASTA
    if (hastaFormatted) {
      const hastaInput = dialog.locator(
        'div.quick-filter-item:has(span.quick-filter-label:text("Fecha")) input.s-DateEditor:not([id^="dp"])'
      );
      console.log(
        'DESDE:',
        await desdeInput.count(),
        'HASTA:',
        await hastaInput.count()
      );
      await fillInput(page, hastaInput, hastaFormatted, true);
    }
  }
  

/**
 * Selecciona un valor en un Select2 del filtro rápido
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string} fieldPattern - Patrón del campo en el ID (ej: "ServicioCodigoPrestador", "ServicioCiudad", "Hotelciudad", "PaqueteCiudad")
 * @param {string} valueToSelect - Valor a seleccionar
 */
export async function selectQuickFilterSelect2(page, fieldPattern, valueToSelect) {
    if (!valueToSelect || !fieldPattern) {
        return;
    }

    // Construir selector para el contenedor Select2 en el filtro rápido
    // El patrón es: div[id^="s2id_"][id*="{fieldPattern}"]
    const selector = `div[id^="s2id_"][id*="${fieldPattern}"]`;
    
    await select2BySearch(page, selector, valueToSelect);
}
