// rpa/helpers/utils.js

/**
 * Convierte una fecha a formato dd/mm/yyyy (formato esperado por la página)
 * Detecta automáticamente el formato de entrada y lo convierte:
 * - mm/dd/yyyy -> dd/mm/yyyy
 * - yyyy-mm-dd -> dd/mm/yyyy
 * - dd/mm/yyyy -> dd/mm/yyyy (sin cambios si ya está correcto)
 * 
 * @param {string} dateStr - Fecha en cualquier formato (mm/dd/yyyy, yyyy-mm-dd, dd/mm/yyyy)
 * @returns {string|null} Fecha en formato dd/mm/yyyy o null si no es válida
 */
export function convertToDDMMYYYY(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return null;
    }

    const trimmed = dateStr.trim();
    if (!trimmed) {
        return null;
    }

    // Formato yyyy-mm-dd (ISO) - más fácil de detectar primero
    const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
    const isoMatch = trimmed.match(isoPattern);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        const year = parseInt(y, 10);
        const month = parseInt(m, 10);
        const day = parseInt(d, 10);
        console.log("year, month, day", year, month, day);
        // Validar que sea un formato válido
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
            // Convertir a dd/mm/yyyy
            return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
        }
    }

    // Formato con barras: puede ser mm/dd/yyyy o dd/mm/yyyy
    const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const slashMatch = trimmed.match(slashPattern);
    if (slashMatch) {
        const [, first, second, y] = slashMatch;
        const num1 = parseInt(first, 10);
        const num2 = parseInt(second, 10);
        const year = parseInt(y, 10);
        
        // Validar año
        if (year < 1900 || year > 2100) {
            return null;
        }
        
        // Si el primer número es > 12, definitivamente es dd/mm/yyyy (ya está correcto)
        if (num1 > 12) {
            // Ya está en formato dd/mm/yyyy
            return `${first.padStart(2, '0')}/${second.padStart(2, '0')}/${y}`;
        }
        
        // Si el segundo número es > 12, definitivamente es mm/dd/yyyy (necesita conversión)
        if (num2 > 12) {
            // Está en formato mm/dd/yyyy, convertir a dd/mm/yyyy
            return `${second.padStart(2, '0')}/${first.padStart(2, '0')}/${y}`;
        }
        
        // Ambos números son <= 12, es ambiguo
        // Por defecto, asumimos que viene en formato mm/dd/yyyy (formato americano común)
        // y lo convertimos a dd/mm/yyyy
        // Ejemplo: 03/05/2024 (mm/dd) -> 05/03/2024 (dd/mm)
        if (num1 >= 1 && num1 <= 12 && num2 >= 1 && num2 <= 31) {
            // Asumir mm/dd/yyyy y convertir a dd/mm/yyyy
            return `${second.padStart(2, '0')}/${first.padStart(2, '0')}/${y}`;
        }
    }

    // Si no coincide con ningún patrón, retornar null
    return null;
}

/**
 * Selecciona un valor en un Select2 usando búsqueda
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string|import('playwright').Locator} containerSelector - Selector del contenedor Select2 (string o Locator)
 * @param {string} valueToSelect - Valor a seleccionar
 */
export async function select2BySearch(page, containerSelector, valueToSelect) {
    if (!valueToSelect) {
        return;
    }

    // Aceptar tanto string como Locator
    const selectContainer = typeof containerSelector === 'string' 
        ? page.locator(containerSelector)
        : containerSelector;
    
    // Timeout extendido a 30s para la visibilidad del Select2
    await selectContainer.waitFor({ state: 'visible', timeout: 30000 });
    await selectContainer.waitFor({ state: 'attached', timeout: 10000 });
    
    // Hacer scroll y click
    await selectContainer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await selectContainer.click();
    await page.waitForTimeout(300);

    // Esperar a que el dropdown se abra
    const visibleDropdown = page.locator('div.select2-drop:visible').first();
    await visibleDropdown.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
    
    const searchInput = visibleDropdown.locator('input.select2-input');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    
    // Limpiar y llenar el campo de búsqueda
    await searchInput.click();
    await page.waitForTimeout(100);
    await searchInput.fill(valueToSelect);
    await page.waitForTimeout(500);
    
    // VERIFICAR que el valor se llenó
    const searchValue = await searchInput.inputValue();
    if (searchValue !== valueToSelect) {
      console.log(`⚠️ Valor de búsqueda no coincidente. Reintentando...`);
      await searchInput.fill(valueToSelect);
      await page.waitForTimeout(500);
    }
    
    // Esperar un momento para que se filtren los resultados
    await page.waitForTimeout(1500);

    // Tomar el PRIMER resultado disponible (sin importar el texto exacto)
    const resultLocator = visibleDropdown.locator('li.select2-results-dept-0').first();
    
    // Timeout extendido a 30s para esperar el resultado de la búsqueda
    await resultLocator.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(200);
    await resultLocator.click();
    await page.waitForTimeout(500);
    
    // VERIFICAR que el valor se seleccionó (leer el texto del contenedor)
    await page.waitForTimeout(500);
    const selectedText = await selectContainer.locator('.select2-chosen').textContent();
    console.log(`✅ Select2 seleccionado. Valor mostrado: "${selectedText}"`);
    
    await page.waitForTimeout(300);
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
    
    // Esperar a que esté visible y habilitado
    await inputLocator.waitFor({ state: 'visible', timeout: 60000 });
    await inputLocator.waitFor({ state: 'attached', timeout: 10000 });
    
    // Verificar que no esté deshabilitado
    const isDisabled = await inputLocator.evaluate(el => {
      return el.hasAttribute('disabled') || el.hasAttribute('readonly') || el.classList.contains('disabled');
    });
    
    if (isDisabled) {
      console.log('⚠️ Input está deshabilitado, intentando habilitarlo...');
      // Intentar habilitar el input
      await inputLocator.evaluate(el => {
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
        el.classList.remove('disabled');
      });
      await page.waitForTimeout(200);
    }
    
    await inputLocator.evaluate(el =>
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
    await page.waitForTimeout(200);
    
    // Limpiar el campo primero - usar evaluate si el click falla
    try {
      await inputLocator.click({ timeout: 5000 });
    } catch (error) {
      console.log('⚠️ Click normal falló, usando evaluate para focus...', error);
      // Si el click falla (por ejemplo, por overlays), usar evaluate directamente
      await inputLocator.evaluate(el => {
        el.focus();
        el.click();
      });
    }
    await page.waitForTimeout(100);
    await inputLocator.evaluate(el => {
      el.value = '';
      el.focus();
    });
    await page.waitForTimeout(100);
    
    // Llenar el campo
    await inputLocator.fill(value);
    await page.waitForTimeout(200);
    
    // Disparar eventos para asegurar que el framework detecte el cambio (crítico en headless)
    await inputLocator.evaluate((el, val) => {
      // Asegurar que el valor esté establecido
      if (el.value !== val) {
        el.value = val;
      }
      // Disparar eventos para que el framework detecte el cambio
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    }, value);
    await page.waitForTimeout(200);
    
    // VERIFICAR que el valor realmente se llenó (crítico en headless)
    const actualValue = await inputLocator.inputValue();
    if (actualValue !== value) {
      console.log(`⚠️ Valor no coincidente. Esperado: "${value}", Obtenido: "${actualValue}". Reintentando...`);
      // Reintentar con clear y fill
      await inputLocator.click({ clickCount: 3 }); // Seleccionar todo
      await page.waitForTimeout(100);
      await inputLocator.fill(value);
      await page.waitForTimeout(200);
      
      // Disparar eventos de nuevo
      await inputLocator.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      }, value);
      await page.waitForTimeout(200);
      
      // Verificar de nuevo
      const retryValue = await inputLocator.inputValue();
      if (retryValue !== value) {
        console.error(`❌ Error: No se pudo llenar el campo. Esperado: "${value}", Obtenido: "${retryValue}"`);
      } else {
        console.log(`✅ Campo llenado correctamente después del reintento: "${value}"`);
      }
    } else {
      console.log(`✅ Campo llenado correctamente: "${value}" y actualValue: "${actualValue}"`);
    }
    
    if (isDate) {
      await inputLocator.press('Tab');
      console.log('⚠️ Pressed Tab', actualValue);
      await page.waitForTimeout(200);
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
    console.log("selector", selector);
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
  
    const desdeFormatted = convertToDDMMYYYY(fechaDesde);
    const hastaFormatted = convertToDDMMYYYY(fechaHasta || fechaDesde);
    if (!desdeFormatted) return;
  
    // 🔒 Scope al diálogo visible
    const dialog = page.locator('.ui-dialog:has(.ui-dialog-title:text("Búsqueda de Disponibilidad"))');
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
    
    // DESDE
    const desdeInput = dialog.locator(
      'div.quick-filter-item:has(span.quick-filter-label:text("Fecha")) input[id*="FecDesde"]'
    ).first();
    await desdeInput.waitFor({ state: 'visible', timeout: 10000 });
    await fillInput(page, desdeInput, desdeFormatted, true);
    
    // VERIFICAR que la fecha desde se llenó
    const desdeValue = await desdeInput.inputValue();
    if (desdeValue !== desdeFormatted) {
      console.log(`⚠️ Fecha DESDE no coincidente. Reintentando...`);
      await fillInput(page, desdeInput, desdeFormatted, true);
      await page.waitForTimeout(500);
    } else {
      console.log(`✅ Fecha DESDE llenada correctamente: "${desdeFormatted}"`);
    }
    
    await page.waitForTimeout(1000);
    
    // HASTA
    if (hastaFormatted) {
      // Buscar el segundo input de fecha (el que tiene id que empieza con "dp")
      const fechaItem = dialog.locator('div.quick-filter-item:has(span.quick-filter-label:text("Fecha"))').first();
      const fechaInputs = fechaItem.locator('input.s-DateEditor');
      const inputCount = await fechaInputs.count();
      
      let hastaInput;
      if (inputCount >= 2) {
        hastaInput = fechaInputs.nth(1);
      } else {
        hastaInput = fechaItem.locator('input[id^="dp"]').first();
      }
      
      const hastaCount = await hastaInput.count();
      console.log(`📅 Inputs de fecha encontrados: DESDE=1, HASTA=${hastaCount}`);
      
      if (hastaCount > 0) {
        await hastaInput.waitFor({ state: 'visible', timeout: 10000 });
        await fillInput(page, hastaInput, hastaFormatted, true);
        
        // VERIFICAR que la fecha hasta se llenó
        const hastaValue = await hastaInput.inputValue();
        if (hastaValue !== hastaFormatted) {
          console.log(`⚠️ Fecha HASTA no coincidente. Reintentando...`);
          await fillInput(page, hastaInput, hastaFormatted, true);
          await page.waitForTimeout(500);
        } else {
          console.log(`✅ Fecha HASTA llenada correctamente: "${hastaFormatted}"`);
        }
      } else {
        console.log(`⚠️ No se encontró el input de fecha HASTA`);
      }
    }
    
    await page.waitForTimeout(1000);
  }
  

/**
 * Selecciona un valor en un Select2 del filtro rápido
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {string} fieldPattern - Patrón del campo en el ID (ej: "ServicioCodigoPrestador", "ServicioCiudad", "Hotelciudad", "PaqueteCiudad")
 * @param {string} valueToSelect - Valor a seleccionar
 */
export async function selectQuickFilterSelect2(page, fieldPattern, valueToSelect) {
    console.log(`🔍 selectQuickFilterSelect2: ${fieldPattern} = "${valueToSelect}"`);
    if (!valueToSelect || !fieldPattern) {
        return;
    }

    // 🔒 Scope al diálogo visible del quick filter
    const dialog = page.locator('.ui-dialog:has(.ui-dialog-title:text("Búsqueda de Disponibilidad"))');
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(300);

    // Construir selector para el contenedor Select2 en el filtro rápido
    // El patrón es: div[id^="s2id_"][id*="{fieldPattern}"]
    const selector = dialog.locator(`div[id^="s2id_"][id*="${fieldPattern}"]`).first();
    console.log(`📍 Buscando Select2 con patrón: ${fieldPattern}`);
    
    const selectorCount = await selector.count();
    if (selectorCount === 0) {
      console.log(`⚠️ No se encontró Select2 con patrón "${fieldPattern}"`);
      return;
    }
    
    await select2BySearch(page, selector, valueToSelect);
    
    // VERIFICAR que el valor se seleccionó
    await page.waitForTimeout(500);
    const selectedText = await selector.locator('.select2-chosen').textContent();
    console.log(`✅ Select2 "${fieldPattern}" seleccionado. Valor mostrado: "${selectedText}"`);
    
    // Verificar que el valor seleccionado contiene el texto buscado (puede tener formato diferente)
    if (selectedText && !selectedText.toLowerCase().includes(valueToSelect.toLowerCase()) && selectedText.trim() !== '') {
      console.log(`⚠️ El valor seleccionado ("${selectedText}") no parece coincidir con el buscado ("${valueToSelect}")`);
    }
}


/**
 * Neutraliza overlays zombis de jQuery UI
 */
export async function disableJQueryUIOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.ui-widget-overlay').forEach(o => {
      o.style.pointerEvents = 'none';
      o.style.display = 'none';
    });
  });
}

/**
 * Click DOM directo (evita hit-testing y overlays)
 */
export async function domClick(locator) {
  await locator.evaluate(el => el.click());
}

/**
 * Click seguro para dialogs jQuery UI
 */
export async function safeDialogClick(page, locator) {
  await disableJQueryUIOverlays(page);
  await domClick(locator);
}
