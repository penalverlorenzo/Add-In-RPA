/**
 * Excel to JSON Service
 * Converts Excel files to JSON format for hotels, services, packages, wineries, sale rates, and descriptions
 */

import XLSX from 'xlsx';

/**
 * Converts Excel buffer to JSON objects
 * Expects Excel file with sheets named: "Hoteles", "Servicios", "Paquetes", "Bodegas" (optional), "Tarifas" (optional), "Descripciones" (optional)
 * @param {Buffer} excelBuffer - Excel file as Buffer
 * @returns {Promise<Object>} Object with Hoteles, Servicios, Paquetes, Bodegas, Tarifas, Descripciones arrays
 */
export async function convertExcelToJson(excelBuffer) {
  try {
    // Parse Excel workbook from buffer
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });

    // Get sheet names
    const sheetNames = workbook.SheetNames;
    console.log('📊 Hojas encontradas en Excel:', sheetNames);

    const result = {
      Hoteles: [],
      Servicios: [],
      Paquetes: [],
      Bodegas: [],
      Tarifas: [],
      Descripciones: []
    };

    // Process each sheet
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert sheet to JSON (first row as headers)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false, // Convert all values to strings/numbers (no dates as numbers)
        defval: null // Default value for empty cells
      });

      // Map sheet name to result key (case-insensitive)
      const normalizedSheetName = sheetName.trim();
      
      if (normalizedSheetName.toLowerCase() === 'hoteles' || normalizedSheetName.toLowerCase() === 'hotels') {
        result.Hoteles = jsonData;
        console.log(`✅ Procesada hoja "${sheetName}": ${jsonData.length} hoteles`);
      } else if (normalizedSheetName.toLowerCase() === 'servicios' || normalizedSheetName.toLowerCase() === 'services') {
        result.Servicios = jsonData;
        console.log(`✅ Procesada hoja "${sheetName}": ${jsonData.length} servicios`);
      } else if (normalizedSheetName.toLowerCase() === 'paquetes' || normalizedSheetName.toLowerCase() === 'packages') {
        result.Paquetes = jsonData;
        console.log(`✅ Procesada hoja "${sheetName}": ${jsonData.length} paquetes`);
      } else if (normalizedSheetName.toLowerCase() === 'bodegas' || normalizedSheetName.toLowerCase() === 'winery') {
        result.Bodegas = jsonData;
        console.log(`✅ Procesada hoja "${sheetName}": ${jsonData.length} bodegas`);
      // DISABLED: Tarifas - re-enable when in use (do not send to IA)
      // } else if (normalizedSheetName.toLowerCase() === 'tarifas' || normalizedSheetName.toLowerCase() === 'sale_rates') {
      //   result.Tarifas = jsonData;
      //   console.log(`✅ Procesada hoja "${sheetName}": ${jsonData.length} tarifas`);
      } else if (normalizedSheetName.toLowerCase() === 'descripciones' || normalizedSheetName.toLowerCase() === 'descriptions') {
        result.Descripciones = jsonData;
        console.log(`✅ Procesada hoja "${sheetName}": ${jsonData.length} fila(s) de descripciones`);
      } else {
        console.warn(`⚠️ Hoja "${sheetName}" no reconocida, se omitirá`);
      }
    }

    // Validate that we got at least some data
    const totalRecords = result.Hoteles.length + result.Servicios.length + result.Paquetes.length;
    if (totalRecords === 0) {
      throw new Error('No se encontraron datos en las hojas esperadas (Hoteles, Servicios, Paquetes)');
    }

    const bodegasInfo = result.Bodegas.length > 0 ? `, ${result.Bodegas.length} bodegas` : '';
    const descripcionesInfo = result.Descripciones.length > 0 ? `, ${result.Descripciones.length} descripciones` : '';
    console.log(`✅ Conversión completada: ${result.Hoteles.length} hoteles, ${result.Servicios.length} servicios, ${result.Paquetes.length} paquetes${bodegasInfo}${descripcionesInfo}`);

    return result;
  } catch (error) {
    console.error('❌ Error converting Excel to JSON:', error.message);
    throw error;
  }
}
