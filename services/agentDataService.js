/**
 * Agent Data Service
 * Handles saving Hotels, Services, Packages, Wineries, Sale Rates, and Descriptions data to MySQL database
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
 * Handles camelCase, PascalCase, and keeps original if already in DB format
 * @param {string} jsonKey - Key from JSON object
 * @returns {string} Normalized column name
 */
function normalizeColumnName(jsonKey) {
  if (!jsonKey || typeof jsonKey !== 'string') return jsonKey;
  
  // If already in PascalCase format (like HotelID, NombreHotel), return as is
  if (/^[A-Z][a-zA-Z0-9]*$/.test(jsonKey)) {
    return jsonKey;
  }
  
  // Convert camelCase to PascalCase
  // e.g., "nombreHotel" -> "NombreHotel", "cantidadMinima" -> "CantidadMinima"
  return jsonKey.charAt(0).toUpperCase() + jsonKey.slice(1);
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
      const query = `ALTER TABLE ?? ADD COLUMN ?? VARCHAR(255) NULL`;
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
 * Saves sale rates (tarifas) to MySQL database
 * @param {Array} tarifas - Array of sale rate objects
 * @returns {Promise<Object>} Statistics: { inserted, updated, errors, total }
 */
export async function saveSaleRatesToDB(tarifas) {
  if (!tarifas || !Array.isArray(tarifas) || tarifas.length === 0) {
    return { inserted: 0, updated: 0, errors: 0, total: 0 };
  }

  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return { inserted: 0, updated: 0, errors: tarifas.length, total: tarifas.length };
  }

  // Get keys from first record (all records have the same structure)
  const firstRecord = tarifas[0];
  const jsonKeys = Object.keys(firstRecord);

  // Get existing columns from sale_rates table
  let existingColumns = await getTableColumns('sale_rates');

  // Create missing columns
  const systemColumns = ['id', 'TarifaID'];
  const columnsCreated = await createMissingColumns('sale_rates', jsonKeys, existingColumns, systemColumns);

  if (columnsCreated > 0) {
    console.log(`✅ ${columnsCreated} columnas nuevas creadas en tabla sale_rates`);
    // Refresh columns list to include newly created ones
    existingColumns = await getTableColumns('sale_rates');
  }

  // Remove columns that are no longer in JSON
  const columnsRemoved = await removeMissingColumns('sale_rates', jsonKeys, existingColumns, systemColumns);

  if (columnsRemoved > 0) {
    console.log(`✅ ${columnsRemoved} columnas eliminadas de tabla sale_rates`);
    // Refresh columns list after removal
    existingColumns = await getTableColumns('sale_rates');
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

  console.log(`💾 Guardando ${tarifas.length} tarifas en la base de datos...`);

  for (const tarifa of tarifas) {
    try {
      // Validate required field
      if (!tarifa.TarifaID) {
        console.warn(`⚠️ Tarifa sin TarifaID, saltando registro:`, tarifa);
        errors++;
        continue;
      }

      // Map JSON to database columns dynamically
      const mappedData = mapJsonToDbColumns(tarifa, dbColumns);

      // Ensure TarifaID is set (required)
      mappedData.TarifaID = tarifa.TarifaID;

      // Build query parameters
      const queryParams = [
        'sale_rates', // table name
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
      console.error(`❌ Error guardando tarifa ${tarifa.TarifaID || 'sin ID'}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Tarifas guardadas: ${inserted} insertadas, ${updated} actualizadas, ${errors} errores`);
  return { inserted, updated, errors, total: tarifas.length };
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
 * @param {Array} tarifas - Array of sale rate objects (optional)
 * @param {Array} descripciones - Array of description objects (optional)
 * @returns {Promise<Object>} Summary of all operations
 */
export async function saveAllDataToDB(hoteles, servicios, paquetes, bodegas, tarifas, descripciones) {
  console.log('💾 Iniciando guardado de datos en base de datos MySQL...');

  const results = {
    hotels: { inserted: 0, updated: 0, errors: 0, total: 0 },
    services: { inserted: 0, updated: 0, errors: 0, total: 0 },
    packages: { inserted: 0, updated: 0, errors: 0, total: 0 },
    wineries: { inserted: 0, updated: 0, errors: 0, total: 0 },
    saleRates: { inserted: 0, updated: 0, errors: 0, total: 0 },
    descriptions: { inserted: 0, updated: 0, errors: 0, total: 0 }
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
    // Save sale rates (tarifas)
    if (tarifas && tarifas.length > 0) {
      results.saleRates = await saveSaleRatesToDB(tarifas);
    }
  } catch (error) {
    console.error('❌ Error guardando tarifas:', error.message);
    results.saleRates.errors = tarifas?.length || 0;
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

  const totalInserted = results.hotels.inserted + results.services.inserted + results.packages.inserted + results.wineries.inserted + results.saleRates.inserted + results.descriptions.inserted;
  const totalUpdated = results.hotels.updated + results.services.updated + results.packages.updated + results.wineries.updated + results.saleRates.updated + results.descriptions.updated;
  const totalErrors = results.hotels.errors + results.services.errors + results.packages.errors + results.wineries.errors + results.saleRates.errors + results.descriptions.errors;

  console.log(`✅ Guardado completado: ${totalInserted} insertados, ${totalUpdated} actualizados, ${totalErrors} errores`);

  return {
    hotels: results.hotels,
    services: results.services,
    packages: results.packages,
    wineries: results.wineries,
    saleRates: results.saleRates,
    descriptions: results.descriptions,
    summary: {
      totalInserted,
      totalUpdated,
      totalErrors,
      totalProcessed: results.hotels.total + results.services.total + results.packages.total + results.wineries.total + results.saleRates.total + results.descriptions.total
    }
  };
}
