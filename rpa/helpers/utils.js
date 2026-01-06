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
 * @param {string} selector - Selector del input
 * @param {string} value - Valor a llenar
 * @param {boolean} isDate - Si es un campo de fecha (presiona Tab después)
 */
export async function fillInput(page, selector, value, isDate = false) {
    if (!value) {
        return;
    }

    const inputLocator = page.locator(selector);

    // Timeout extendido a 60s para visibilidad
    await inputLocator.waitFor({ state: 'visible', timeout: 60000 });

    // Forzar scroll al elemento para asegurar interacción en modales largos
    await inputLocator.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));

    await inputLocator.fill(value);

    if (isDate) {
        // Presionar Tab para validar campo de fecha
        await inputLocator.press('Tab');
    }
    await page.waitForTimeout(500); 
}

