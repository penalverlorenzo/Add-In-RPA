/**
 * Agent Data Service
 * Handles saving Hotels, Services, Packages, Wineries, Providers, Sale Rates, and Descriptions data to MySQL database
 * Uses INSERT ... ON DUPLICATE KEY UPDATE to handle duplicates
 */

import mysql from 'mysql2/promise';
import config from '../config/index.js';

let connectionPool = null;

/**
 * Gets MySQL connection pool
 * Reuses the same pool pattern as mysqlMasterDataService
 * @returns {mysql.Pool|null} MySQL connection pool
 */
function getMySQLPool() {
  if (!connectionPool) {
    if (!config.mysql.host || !config.mysql.user || !config.mysql.password) {
      console.warn('⚠️ MySQL configuration incomplete');
      return null;
    }

    const poolConfig = {
      host: config.mysql.host,
      port: parseInt(config.mysql.port) || 3306,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
      acquireTimeout: 10000,
      timeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    if (config.mysql.ssl || config.mysql.host?.includes('mysql.database.azure.com')) {
      poolConfig.ssl = {
        rejectUnauthorized: false
      };
    }

    try {
      connectionPool = mysql.createPool(poolConfig);
    } catch (error) {
      console.error('❌ Error initializing MySQL pool:', error.message);
      return null;
    }
  }
  return connectionPool;
}

/**
 * Converts a date value to MySQL datetime format
 * Handles DD/MM/YYYY format from Excel and converts to YYYY-MM-DD for MySQL
 * @param {any} dateValue - Date value (string, Date object, or null)
 * @returns {string|null} MySQL datetime string or null
 */
function convertToMySQLDateTime(dateValue) {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 19).replace('T', ' ');
  }
  
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    
    // Check if already in MySQL format (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
    if (/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/.test(trimmed)) {
      return trimmed;
    }
    
    // Handle DD/MM/YYYY format from Excel (with optional time)
    // Matches: DD/MM/YYYY or DD/MM/YYYY HH:MM:SS
    const ddmmyyyyPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/;
    const ddmmyyyyMatch = trimmed.match(ddmmyyyyPattern);
    
    if (ddmmyyyyMatch) {
      const day = ddmmyyyyMatch[1].padStart(2, '0');
      const month = ddmmyyyyMatch[2].padStart(2, '0');
      const year = ddmmyyyyMatch[3];
      const time = ddmmyyyyMatch[5] ? 
        ` ${ddmmyyyyMatch[5].padStart(2, '0')}:${ddmmyyyyMatch[6].padStart(2, '0')}:${ddmmyyyyMatch[7].padStart(2, '0')}` : 
        '';
      
      // Validate date components
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
        return `${year}-${month}-${day}${time}`;
      }
    }
    
    // Try to parse other common date formats
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
  }
  
  return null;
}

/**
 * Converts empty strings to null for optional fields
 * @param {any} value - Value to convert
 * @returns {any} Value or null if empty string
 */
function emptyToNull(value) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Converts a numeric value to a valid number, handling comma as decimal separator
 * @param {any} value - Numeric value (string with comma or dot, number, or null)
 * @returns {number|null} Valid number or null
 */
function convertToNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  
  // If already a number, return it
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  
  // If string, convert comma to dot for decimal separator
  if (typeof value === 'string') {
    // Remove any whitespace
    const cleaned = value.trim();
    if (cleaned === '') return null;
    
    // Replace comma with dot for decimal separator
    const normalized = cleaned.replace(',', '.');
    
    // Try to parse as float
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  }
  
  return null;
}

/**
 * Normalizes column name from JSON to database format
 * - Removes diacritics (accents): á->a, é->e, etc.
 * - Replaces spaces and hyphens with underscore
 * - Handles camelCase, PascalCase, and keeps original if already in DB format
 * @param {string} jsonKey - Key from JSON object
 * @returns {string} Normalized column name
 */
function normalizeColumnName(jsonKey) {
  if (!jsonKey || typeof jsonKey !== 'string') return jsonKey;

  let normalized = jsonKey
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove combining diacritics (accents)
    .replace(/\s+/g, '_') // spaces to underscore
    .replace(/-+/g, '_') // hyphens to underscore
    .replace(/_+/g, '_') // collapse multiple underscores
    .replace(/^_|_$/g, ''); // trim leading/trailing underscores

  if (!normalized) return jsonKey;

  // If already in PascalCase format (like HotelID, NombreHotel, Precio_Unitario), return as is
  if (/^[A-Z][a-zA-Z0-9_]*$/.test(normalized)) {
    return normalized;
  }

  // Convert camelCase to PascalCase (first letter upper)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Validates column name to prevent SQL injection
 * @param {string} columnName - Column name to validate
 * @returns {boolean} True if valid
 */
function isValidColumnName(columnName) {
  // Allow alphanumeric characters and underscore
  // Column names should start with a letter
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(columnName);
}

/**
 * Gets existing columns from a MySQL table
 * @param {string} tableName - Name of the table
 * @returns {Promise<string[]>} Array of column names
 */
async function getTableColumns(tableName) {
  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return [];
  }

  try {
    const query = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;
    
    const [rows] = await pool.query(query, [config.mysql.database, tableName]);
    return rows.map(row => row.COLUMN_NAME);
  } catch (error) {
    console.error(`❌ Error getting columns for table ${tableName}:`, error.message);
    return [];
  }
}

/**
 * Creates missing columns in a table
 * @param {string} tableName - Name of the table
 * @param {Array<string>} jsonKeys - Keys from JSON object (normalized)
 * @param {Array<string>} existingColumns - Existing column names
 * @param {Array<string>} systemColumns - System columns to exclude (e.g., ['id', 'HotelID'])
 * @returns {Promise<number>} Number of columns created
 */
async function createMissingColumns(tableName, jsonKeys, existingColumns, systemColumns = []) {
  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return 0;
  }

  // Normalize JSON keys and filter out system columns
  const normalizedKeys = jsonKeys
    .map(key => normalizeColumnName(key))
    .filter(key => {
      // Exclude system columns
      if (systemColumns.includes(key)) return false;
      // Exclude if already exists
      if (existingColumns.includes(key)) return false;
      // Validate column name
      if (!isValidColumnName(key)) {
        console.warn(`⚠️ Invalid column name skipped: ${key}`);
        return false;
      }
      return true;
    });

  if (normalizedKeys.length === 0) {
    return 0;
  }

  // Remove duplicates
  const uniqueMissingColumns = [...new Set(normalizedKeys)];
  
  console.log(`🔧 Creando ${uniqueMissingColumns.length} columnas faltantes en tabla ${tableName}:`, uniqueMissingColumns);

  let created = 0;
  for (const columnName of uniqueMissingColumns) {
    try {
      const query = `ALTER TABLE ?? ADD COLUMN ?? TEXT NULL`;
      await pool.query(query, [tableName, columnName]);
      console.log(`   ✅ Columna creada: ${columnName}`);
      created++;
    } catch (error) {
      // Handle duplicate column error (concurrency case)
      if (error.code === 'ER_DUP_FIELDNAME' || error.errno === 1060) {
        console.log(`   ℹ️ Columna ${columnName} ya existe (probablemente creada por otro proceso)`);
      } else {
        console.error(`   ❌ Error creando columna ${columnName}:`, error.message);
      }
    }
  }

  return created;
}

/**
 * Removes columns from a table that are no longer present in the JSON
 * @param {string} tableName - Name of the table
 * @param {Array<string>} jsonKeys - Keys from JSON object (normalized)
 * @param {Array<string>} existingColumns - Existing column names
 * @param {Array<string>} systemColumns - System columns to preserve (e.g., ['id', 'HotelID'])
 * @returns {Promise<number>} Number of columns removed
 */
async function removeMissingColumns(tableName, jsonKeys, existingColumns, systemColumns = []) {
  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return 0;
  }

  // Normalize JSON keys
  const normalizedJsonKeys = jsonKeys.map(key => normalizeColumnName(key));
  
  // Find columns that exist in DB but not in JSON
  const columnsToRemove = existingColumns.filter(column => {
    // Preserve system columns (id, HotelID, ServicioID, PaqueteID)
    if (systemColumns.includes(column)) return false;
    // Preserve columns that exist in JSON
    if (normalizedJsonKeys.includes(column)) return false;
    // Validate column name (safety check)
    if (!isValidColumnName(column)) {
      console.warn(`⚠️ Invalid column name skipped for removal: ${column}`);
      return false;
    }
    return true;
  });

  if (columnsToRemove.length === 0) {
    return 0;
  }

  console.log(`🗑️ Eliminando ${columnsToRemove.length} columnas que ya no están en el JSON de tabla ${tableName}:`, columnsToRemove);

  let removed = 0;
  for (const columnName of columnsToRemove) {
    try {
      const query = `ALTER TABLE ?? DROP COLUMN ??`;
      await pool.query(query, [tableName, columnName]);
      console.log(`   ✅ Columna eliminada: ${columnName}`);
      removed++;
    } catch (error) {
      // Handle column not found error (concurrency case)
      if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY' || error.errno === 1091) {
        console.log(`   ℹ️ Columna ${columnName} ya no existe (probablemente eliminada por otro proceso)`);
      } else {
        console.error(`   ❌ Error eliminando columna ${columnName}:`, error.message);
      }
    }
  }

  return removed;
}

/**
 * Maps JSON object values to database columns dynamically
 * Handles camelCase/PascalCase variations and special field conversions
 * @param {Object} jsonRecord - JSON record object
 * @param {Array<string>} dbColumns - Database column names
 * @returns {Object} Mapped values object
 */
function mapJsonToDbColumns(jsonRecord, dbColumns) {
  const mapped = {};
  
  // Create a lookup map for faster access (normalize all JSON keys)
  const jsonLookup = {};
  for (const key of Object.keys(jsonRecord)) {
    const normalizedKey = normalizeColumnName(key);
    // Store both original and normalized key for lookup
    jsonLookup[key] = jsonRecord[key];
    jsonLookup[normalizedKey] = jsonRecord[key];
    // Also store lowercase and camelCase variations
    jsonLookup[key.toLowerCase()] = jsonRecord[key];
    jsonLookup[key.charAt(0).toLowerCase() + key.slice(1)] = jsonRecord[key];
  }
  
  for (const column of dbColumns) {
    // Skip system columns that are auto-generated
    if (column === 'id') continue;
    
    // Try different variations of the column name in the JSON
    let value = jsonRecord[column] || 
                jsonLookup[column] ||
                jsonRecord[column.charAt(0).toLowerCase() + column.slice(1)] ||
                jsonRecord[column.toUpperCase()] ||
                jsonRecord[column.toLowerCase()] ||
                jsonLookup[normalizeColumnName(column)];
    
    // Handle special field conversions
    if (column === 'Precio' || column === 'precio') {
      value = convertToNumber(value);
    } else if (column === 'VigenciaDesde' || column === 'vigenciaDesde' || column === 'VigenciaHasta' || column === 'vigenciaHasta') {
      value = convertToMySQLDateTime(value);
    } else if (column.includes('Cantidad') || column.includes('Dias') || column.includes('Noches') || column.includes('Pasos')) {
      // Numeric fields
      value = value || 0;
    } else {
      // String fields - convert empty to null
      value = emptyToNull(value);
    }
    
    mapped[column] = value;
  }
  
  return mapped;
}

/**
 * Saves hotels to MySQL database
 * @param {Array} hoteles - Array of hotel objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveHotelsToDB(hoteles) {
  if (!hoteles || !Array.isArray(hoteles) || hoteles.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: hoteles.length, total: hoteles.length };
  }

  // Get keys from first record (all records have the same structure)
  const firstRecord = hoteles[0];
  const jsonKeys = Object.keys(firstRecord);
  
  // Get existing columns from hotels table
  let existingColumns = await getTableColumns('hotels');
  
  // Create missing columns
  const systemColumns = ['id', 'HotelID'];
  const columnsCreated = await createMissingColumns('hotels', jsonKeys, existingColumns, systemColumns);
  
  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla hotels`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('hotels');
  }
  
  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('hotels', jsonKeys, existingColumns, systemColumns);
  
  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla hotels`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('hotels');
  }

  // Filter columns: exclude 'id' (auto-generated), include all others
  const dbColumns = existingColumns.filter(col => col !== 'id');
  
  // Build query once (reusable for all records)
  const updateColumns = dbColumns.filter(col => col !== 'HotelID');
  const columnsPlaceholders = dbColumns.map(() => '??').join(', ');
  const valuesPlaceholders = dbColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');
  
  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${hoteles.length} hoteles en la base de datos...`);

  for (const hotel of hoteles) {
    try {
      // Validate required field
      if (!hotel.HotelID) {
        console.warn(`⚠️ Hotel sin HotelID, saltando registro:`, hotel);
        errors++;
        continue;
      }

      // Map JSON to database columns dynamically
      const mappedData = mapJsonToDbColumns(hotel, dbColumns);
      
      // Ensure HotelID is set (required)
      mappedData.HotelID = hotel.HotelID;

      // Build query parameters
      const queryParams = [
        'hotels', // table name
        ...dbColumns, // column names for INSERT
        ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null), // values
        ...updateColumns.flatMap(col => [col, col]) // column names for UPDATE (twice for VALUES())
      ];

      const [result] = await pool.query(query, queryParams);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando hotel ${hotel.HotelID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Hoteles guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: hoteles.length };
}

/**
 * Saves services to MySQL database
 * @param {Array} servicios - Array of service objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveServicesToDB(servicios) {
  if (!servicios || !Array.isArray(servicios) || servicios.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: servicios.length, total: servicios.length };
  }

  // Get keys from first record (all records have the same structure)
  const firstRecord = servicios[0];
  const jsonKeys = Object.keys(firstRecord);
  
  // Get existing columns from services table
  let existingColumns = await getTableColumns('services');
  
  // Create missing columns
  const systemColumns = ['id', 'ServicioID'];
  const columnsCreated = await createMissingColumns('services', jsonKeys, existingColumns, systemColumns);
  
  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla services`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('services');
  }
  
  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('services', jsonKeys, existingColumns, systemColumns);
  
  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla services`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('services');
  }

  // Filter columns: exclude 'id' (auto-generated), include all others
  const dbColumns = existingColumns.filter(col => col !== 'id');
  
  // Build query once (reusable for all records)
  const updateColumns = dbColumns.filter(col => col !== 'ServicioID');
  const columnsPlaceholders = dbColumns.map(() => '??').join(', ');
  const valuesPlaceholders = dbColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');
  
  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${servicios.length} servicios en la base de datos...`);

  for (const servicio of servicios) {
    try {
      // Validate required field
      if (!servicio.ServicioID) {
        console.warn(`⚠️ Servicio sin ServicioID, saltando registro:`, servicio);
        errors++;
        continue;
      }

      // Map JSON to database columns dynamically
      const mappedData = mapJsonToDbColumns(servicio, dbColumns);
      
      // Ensure ServicioID is set (required)
      mappedData.ServicioID = servicio.ServicioID;

      // Build query parameters
      const queryParams = [
        'services', // table name
        ...dbColumns, // column names for INSERT
        ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null), // values
        ...updateColumns.flatMap(col => [col, col]) // column names for UPDATE (twice for VALUES())
      ];

      const [result] = await pool.query(query, queryParams);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando servicio ${servicio.ServicioID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Servicios guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: servicios.length };
}

/**
 * Saves packages to MySQL database
 * @param {Array} paquetes - Array of package objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function savePackagesToDB(paquetes) {
  if (!paquetes || !Array.isArray(paquetes) || paquetes.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: paquetes.length, total: paquetes.length };
  }

  // Get keys from first record (all records have the same structure)
  const firstRecord = paquetes[0];
  const jsonKeys = Object.keys(firstRecord);
  
  // Get existing columns from packages table
  let existingColumns = await getTableColumns('packages');
  
  // Create missing columns
  const systemColumns = ['id', 'PaqueteID'];
  const columnsCreated = await createMissingColumns('packages', jsonKeys, existingColumns, systemColumns);
  
  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla packages`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('packages');
  }
  
  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('packages', jsonKeys, existingColumns, systemColumns);
  
  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla packages`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('packages');
  }

  // Filter columns: exclude 'id' (auto-generated), include all others
  const dbColumns = existingColumns.filter(col => col !== 'id');
  
  // Build query once (reusable for all records)
  const updateColumns = dbColumns.filter(col => col !== 'PaqueteID');
  const columnsPlaceholders = dbColumns.map(() => '??').join(', ');
  const valuesPlaceholders = dbColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');
  
  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${paquetes.length} paquetes en la base de datos...`);

  for (const paquete of paquetes) {
    try {
      // Validate required field
      if (!paquete.PaqueteID) {
        console.warn(`⚠️ Paquete sin PaqueteID, saltando registro:`, paquete);
        errors++;
        continue;
      }

      // Map JSON to database columns dynamically
      const mappedData = mapJsonToDbColumns(paquete, dbColumns);
      
      // Ensure PaqueteID is set (required)
      mappedData.PaqueteID = paquete.PaqueteID;

      // Build query parameters
      const queryParams = [
        'packages', // table name
        ...dbColumns, // column names for INSERT
        ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null), // values
        ...updateColumns.flatMap(col => [col, col]) // column names for UPDATE (twice for VALUES())
      ];

      const [result] = await pool.query(query, queryParams);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando paquete ${paquete.PaqueteID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Paquetes guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: paquetes.length };
}

/**
 * Saves wineries (bodegas) to MySQL database
 * @param {Array} bodegas - Array of winery objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveWineriesToDB(bodegas) {
  if (!bodegas || !Array.isArray(bodegas) || bodegas.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: bodegas.length, total: bodegas.length };
  }

  // Get keys from first record (all records have the same structure)
  const firstRecord = bodegas[0];
  const jsonKeys = Object.keys(firstRecord);

  // Get existing columns from winery table
  let existingColumns = await getTableColumns('winery');

  // Create missing columns
  const systemColumns = ['id', 'BodegaID'];
  const columnsCreated = await createMissingColumns('winery', jsonKeys, existingColumns, systemColumns);

  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla winery`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('winery');
  }

  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('winery', jsonKeys, existingColumns, systemColumns);

  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla winery`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('winery');
  }

  // Filter columns: exclude 'id' (auto-generated), include all others
  const dbColumns = existingColumns.filter(col => col !== 'id');

  // Build query once (reusable for all records)
  const updateColumns = dbColumns.filter(col => col !== 'BodegaID');
  const columnsPlaceholders = dbColumns.map(() => '??').join(', ');
  const valuesPlaceholders = dbColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');

  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${bodegas.length} bodegas en la base de datos...`);

  for (const bodega of bodegas) {
    try {
      // Validate required field
      if (!bodega.BodegaID) {
        console.warn(`⚠️ Bodega sin BodegaID, saltando registro:`, bodega);
        errors++;
        continue;
      }

      // Map JSON to database columns dynamically
      const mappedData = mapJsonToDbColumns(bodega, dbColumns);

      // Ensure BodegaID is set (required)
      mappedData.BodegaID = bodega.BodegaID;

      // Build query parameters
      const queryParams = [
        'winery', // table name
        ...dbColumns, // column names for INSERT
        ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null), // values
        ...updateColumns.flatMap(col => [col, col]) // column names for UPDATE (twice for VALUES())
      ];

      const [result] = await pool.query(query, queryParams);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando bodega ${bodega.BodegaID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Bodegas guardadas: ${inserted} insertadas, ${updated} actualizadas, ${errors} errores`);
  return { inserted, updated, errors, total: bodegas.length };
}

/**
 * Saves providers (proveedores) to MySQL database. Table `providers` is keyed by CodProveedor (unique).
 * @param {Array} proveedores - Array of provider objects (Proveedor, CodProveedor)
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveProvidersToDB(proveedores) {
  if (!proveedores || !Array.isArray(proveedores) || proveedores.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: proveedores.length, total: proveedores.length };
  }

  const firstRecord = proveedores[0];
  const jsonKeys = Object.keys(firstRecord);

  let existingColumns = await getTableColumns('providers');

  const systemColumns = ['id', 'CodProveedor'];
  const columnsCreated = await createMissingColumns('providers', jsonKeys, existingColumns, systemColumns);

  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla providers`);
    existingColumns = await getTableColumns('providers');
  }

  const columnsRemoved = await removeMissingColumns('providers', jsonKeys, existingColumns, systemColumns);

  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla providers`);
    existingColumns = await getTableColumns('providers');
  }

  const dbColumns = existingColumns.filter(col => col !== 'id');

  const updateColumns = dbColumns.filter(col => col !== 'CodProveedor');
  const columnsPlaceholders = dbColumns.map(() => '??').join(', ');
  const valuesPlaceholders = dbColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');

  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${proveedores.length} proveedores en la base de datos...`);

  for (const row of proveedores) {
    try {
      const codRaw = row.CodProveedor ?? row.codProveedor;
      if (codRaw === null || codRaw === undefined || String(codRaw).trim() === '') {
        console.warn(`⚠️ Proveedor sin CodProveedor, saltando registro:`, row);
        errors++;
        continue;
      }

      const mappedData = mapJsonToDbColumns(row, dbColumns);
      mappedData.CodProveedor = String(codRaw).trim();

      const queryParams = [
        'providers',
        ...dbColumns,
        ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null),
        ...updateColumns.flatMap(col => [col, col])
      ];

      const [result] = await pool.query(query, queryParams);

      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando proveedor ${row.CodProveedor || 'sin código'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Proveedores guardados: ${inserted} insertados, ${updated} actualizados, ${errors} errores`);
  return { inserted, updated, errors, total: proveedores.length };
}

/**
 * Saves products information (products_information) to MySQL database
 * @param {Array} products_information - Array of products information objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveProductsInformationToDB(products_information) {
  if (!products_information || !Array.isArray(products_information) || products_information.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: products_information.length, total: products_information.length };
  }

  // Get keys from first record (all records have the same structure)
  const firstRecord = products_information[0];
  const jsonKeys = Object.keys(firstRecord);

  // Get existing columns from products_information table
  let existingColumns = await getTableColumns('products_information');

  // Create missing columns
  const systemColumns = ['id', 'TarifaID'];
  const columnsCreated = await createMissingColumns('products_information', jsonKeys, existingColumns, systemColumns);

  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla products_information`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('products_information');
  }

  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('products_information', jsonKeys, existingColumns, systemColumns);

  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla products_information`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('products_information');
  }

  // Filter columns: exclude 'id' (auto-generated), include all others
  const dbColumns = existingColumns.filter(col => col !== 'id');

  // Build query once (reusable for all records)
  const updateColumns = dbColumns.filter(col => col !== 'TarifaID');
  const columnsPlaceholders = dbColumns.map(() => '??').join(', ');
  const valuesPlaceholders = dbColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');

  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando ${products_information.length} products_information en la base de datos...`);

  for (const product_information of products_information) {
    try {
      // Validate required field
      if (!product_information.InfoID) {
        console.warn(`⚠️ Tarifa sin TarifaID, saltando registro:`, product_information);
        errors++;
        continue;
      }

      // Map JSON to database columns dynamically
      const mappedData = mapJsonToDbColumns(product_information, dbColumns);

      // Ensure InfoID is set (required)
      mappedData.InfoID = product_information.InfoID;

      // Build query parameters
      const queryParams = [
        'products_information', // table name
        ...dbColumns, // column names for INSERT
        ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null), // values
        ...updateColumns.flatMap(col => [col, col]) // column names for UPDATE (twice for VALUES())
      ];

      const [result] = await pool.query(query, queryParams);

      // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error guardando products_information ${product_information.InfoID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ products_information guardadas: ${inserted} insertadas, ${updated} actualizadas, ${errors} errores`);
  return { inserted, updated, errors, total: products_information.length };
}

/**
 * Saves descriptions to MySQL database
 * Only saves the first row (id=1) since descriptions table has only one row
 * @param {Array} descripciones - Array of description objects (only first one is used)
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveDescriptionsToDB(descripciones) {
  if (!descripciones || !Array.isArray(descripciones) || descripciones.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: 1, total: 1 };
  }

  // Only use the first row
  const firstRecord = descripciones[0];
  const jsonKeys = Object.keys(firstRecord);
  
  // Get existing columns from descriptions table
  let existingColumns = await getTableColumns('descriptions');
  
  // Create missing columns
  const systemColumns = ['id'];
  const columnsCreated = await createMissingColumns('descriptions', jsonKeys, existingColumns, systemColumns);
  
  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla descriptions`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('descriptions');
  }
  
  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('descriptions', jsonKeys, existingColumns, systemColumns);
  
  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla descriptions`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('descriptions');
  }

  // Include 'id' in dbColumns since we need it for the INSERT
  const dbColumns = existingColumns.filter(col => col !== 'id');
  const allColumns = ['id', ...dbColumns];
  
  // Build query with INSERT ... ON DUPLICATE KEY UPDATE
  // Since we always use id=1, this will update the existing row or insert if it doesn't exist
  const updateColumns = dbColumns; // Update all columns except id
  const columnsPlaceholders = allColumns.map(() => '??').join(', ');
  const valuesPlaceholders = allColumns.map(() => '?').join(', ');
  const updateClause = updateColumns.map(col => `?? = VALUES(??)`).join(', ');
  
  const query = `
    INSERT INTO ?? (${columnsPlaceholders})
    VALUES (${valuesPlaceholders})
    ON DUPLICATE KEY UPDATE
      ${updateClause}
  `;

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`💾 Guardando descripciones en la base de datos...`);

  try {
    // Map JSON to database columns dynamically
    const mappedData = mapJsonToDbColumns(firstRecord, dbColumns);
    
    // Ensure id is set to 1
    mappedData.id = 1;

    // Build query parameters
    const queryParams = [
      'descriptions', // table name
      ...allColumns, // column names for INSERT (id, col1, col2, ...)
      1, // id value (always 1)
      ...dbColumns.map(col => mappedData[col] !== undefined ? mappedData[col] : null), // other values
      ...updateColumns.flatMap(col => [col, col]) // column names for UPDATE (twice for VALUES())
    ];

    const [result] = await pool.query(query, queryParams);

    // Check if it was an insert (affectedRows = 1) or update (affectedRows = 2)
    if (result.affectedRows === 1) {
      inserted++;
    } else if (result.affectedRows === 2) {
      updated++;
    }
  } catch (error) {
    console.error(`❌ Error guardando descripciones:`, error.message);
    errors++;
  }

  console.log(`✅ Descripciones guardadas: ${inserted} insertadas, ${updated} actualizadas, ${errors} errores`);
  return { inserted, updated, errors, total: 1 };
}

/**
 * Saves all data (hotels, services, packages, wineries, sale rates, descriptions) to MySQL database
 * @param {Array} hoteles - Array of hotel objects
 * @param {Array} servicios - Array of service objects
 * @param {Array} paquetes - Array of package objects
 * @param {Array} bodegas - Array of winery objects (optional)
 * @param {Array} products_information - Array of products information objects (optional)
 * @param {Array} descripciones - Array of description objects (optional)
 * @param {Array} proveedores - Array of provider objects (optional); persisted only to DB, not to vector store
 * @returns {Promise<Object>} Summary of all operations
 */
export async function saveAllDataToDB(hoteles, servicios, paquetes, bodegas, products_information, descripciones, proveedores) {
  console.log('💾 Iniciando guardado de datos en base de datos MySQL...');

  const results = {
    hotels: { inserted: 0, updated: 0, errors: 0, total: 0 },
    services: { inserted: 0, updated: 0, errors: 0, total: 0 },
    packages: { inserted: 0, updated: 0, errors: 0, total: 0 },
    wineries: { inserted: 0, updated: 0, errors: 0, total: 0 },
    products_information: { inserted: 0, updated: 0, errors: 0, total: 0 },
    descriptions: { inserted: 0, updated: 0, errors: 0, total: 0 },
    providers: { inserted: 0, updated: 0, errors: 0, total: 0 }
  };

  try {
    // Save hotels
    if (hoteles && hoteles.length > 0) {
      results.hotels = await saveHotelsToDB(hoteles);
    }
  } catch (error) {
    console.error('❌ Error guardando hoteles:', error.message);
    results.hotels.errors = hoteles?.length || 0;
  }

  try {
    // Save services
    if (servicios && servicios.length > 0) {
      results.services = await saveServicesToDB(servicios);
    }
  } catch (error) {
    console.error('❌ Error guardando servicios:', error.message);
    results.services.errors = servicios?.length || 0;
  }

  try {
    // Save packages
    if (paquetes && paquetes.length > 0) {
      results.packages = await savePackagesToDB(paquetes);
    }
  } catch (error) {
    console.error('❌ Error guardando paquetes:', error.message);
    results.packages.errors = paquetes?.length || 0;
  }

  try {
    // Save wineries (bodegas)
    if (bodegas && bodegas.length > 0) {
      results.wineries = await saveWineriesToDB(bodegas);
    }
  } catch (error) {
    console.error('❌ Error guardando bodegas:', error.message);
    results.wineries.errors = bodegas?.length || 0;
  }

  try {
    if (proveedores && proveedores.length > 0) {
      results.providers = await saveProvidersToDB(proveedores);
    }
  } catch (error) {
    console.error('❌ Error guardando proveedores:', error.message);
    results.providers.errors = proveedores?.length || 0;
  }

  // DISABLED: products_information - re-enable when in use (saveProductsInformationToDB)
   try {
     if (products_information && products_information.length > 0) {
       results.products_information = await saveProductsInformationToDB(products_information);
     }
   } catch (error) {
     console.error('❌ Error guardando products_information:', error.message);
     results.products_information.errors = products_information?.length || 0;
   }

  try {
    // Save descriptions
    if (descripciones && descripciones.length > 0) {
      results.descriptions = await saveDescriptionsToDB(descripciones);
    }
  } catch (error) {
    console.error('❌ Error guardando descripciones:', error.message);
    results.descriptions.errors = descripciones?.length || 0;
  }

  const totalInserted = results.hotels.inserted + results.services.inserted + results.packages.inserted + results.wineries.inserted + results.descriptions.inserted + results.products_information.inserted + results.providers.inserted;
  const totalUpdated = results.hotels.updated + results.services.updated + results.packages.updated + results.wineries.updated + results.descriptions.updated + results.products_information.updated + results.providers.updated;
  const totalErrors = results.hotels.errors + results.services.errors + results.packages.errors + results.wineries.errors + results.descriptions.errors + results.products_information.errors + results.providers.errors;

  console.log(`✅ Guardado completado: ${totalInserted} insertados, ${totalUpdated} actualizados, ${totalErrors} errores`);

  return {
    hotels: results.hotels,
    services: results.services,
    packages: results.packages,
    wineries: results.wineries,
    products_information: results.products_information,
    descriptions: results.descriptions,
    providers: results.providers,
    summary: {
      totalInserted,
      totalUpdated,
      totalErrors,
      totalProcessed: results.hotels.total + results.services.total + results.packages.total + results.wineries.total + results.descriptions.total + results.products_information.total + results.providers.total
    }
  };
}
