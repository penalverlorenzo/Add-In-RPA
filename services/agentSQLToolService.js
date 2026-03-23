/**
 * Agent SQL Tool Service
 * Provider search, operational/products queries, and optional discovery without CodProveedor
 */

import { ToolUtility } from '@azure/ai-agents';
import mysql from 'mysql2/promise';
import config from '../config/index.js';

async function getMySQLPool() {
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
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };

  if (config.mysql.ssl || config.mysql.host?.includes('mysql.database.azure.com')) {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }

  return mysql.createPool(poolConfig);
}

const OPERATIONAL_TABLES = ['hotels', 'services', 'packages', 'winery'];
const PRODUCTS_TABLE = 'products_information';
const FALLBACK_MAX_LIMIT_NO_WHERE = 50;
const DISCOVER_MAX_LIMIT_WITH_SEARCH = 300;

const DATA_TOOL_NAMES = [
  'searchProvidersByName',
  'discoverDataWithoutProvider',
  'queryOperationalData',
  'queryProductsInformation'
];

async function getTableColumnNames(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [config.mysql.database, tableName]
  );
  return rows.map((r) => r.COLUMN_NAME);
}

function isValidColumnName(columnName) {
  return /^[a-zA-Z0-9_.]+$/.test(columnName);
}

function isValidOrderBy(orderBy) {
  return /^[a-zA-Z0-9_.\s,]+(ASC|DESC)?$/i.test(orderBy.trim());
}

function parseOrderByColumnIdentifiers(orderBy) {
  if (!orderBy || typeof orderBy !== 'string') return [];
  const segments = orderBy.split(',').map((s) => s.trim()).filter(Boolean);
  const ids = [];
  for (const seg of segments) {
    let s = seg.replace(/\s+(ASC|DESC)\s*$/i, '').trim();
    if (!s) continue;
    s = s.replace(/`/g, '');
    const last = s.includes('.') ? s.split('.').pop() : s;
    if (last && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(last)) {
      ids.push(last);
    }
  }
  return ids;
}

function validateOrderByAgainstSchema(orderBy, tableCols) {
  const segments = orderBy.split(',').map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const s = seg.replace(/\s+(ASC|DESC)\s*$/i, '').trim();
    if (s && /^\d+$/.test(s)) {
      throw new Error(
        'ORDER BY column positions are not allowed; use only real column names from the table schema.'
      );
    }
  }
  const identifiers = parseOrderByColumnIdentifiers(orderBy);
  if (identifiers.length === 0) return;
  const idLower = (c) => c.toLowerCase();
  const unknown = [...new Set(identifiers)].filter(
    (id) => !tableCols.some((c) => c && idLower(c) === id.toLowerCase())
  );
  if (unknown.length > 0) {
    throw new Error(
      `Invalid ORDER BY: unknown column(s): ${unknown.join(', ')}. Use only columns that exist on the queried table.`
    );
  }
}

async function getProviderTextLikeColumns(pool) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'providers'
     AND DATA_TYPE IN ('varchar', 'char', 'text', 'mediumtext', 'longtext')
     ORDER BY ORDINAL_POSITION`,
    [config.mysql.database]
  );
  return rows.map((r) => r.COLUMN_NAME).filter((c) => c && String(c).toLowerCase() !== 'id');
}

async function getTableTextLikeColumns(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     AND DATA_TYPE IN ('varchar', 'char', 'text', 'mediumtext', 'longtext')
     ORDER BY ORDINAL_POSITION`,
    [config.mysql.database, tableName]
  );
  return rows.map((r) => r.COLUMN_NAME).filter((c) => c && String(c).toLowerCase() !== 'id');
}

/**
 * @param {string[]} columnsInput
 * @param {string[]} tableCols
 * @returns {string[] | null}
 */
function buildDiscoverSelectColumnsForTable(columnsInput, tableCols) {
  const tableColsLower = new Map(tableCols.map((c) => [c.toLowerCase(), c]));
  const selected = [];
  const seen = new Set();
  for (const col of columnsInput) {
    const canon = tableColsLower.get(String(col).toLowerCase());
    if (canon && !seen.has(canon)) {
      selected.push(canon);
      seen.add(canon);
    }
  }
  const codCanon = tableColsLower.get('codproveedor');
  if (codCanon && !seen.has(codCanon)) {
    selected.push(codCanon);
  }
  return selected.length > 0 ? selected : null;
}

function escapeSqlLikePattern(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function normalizeCodProveedorList(codProveedor) {
  if (codProveedor === undefined || codProveedor === null) {
    return [];
  }
  const arr = Array.isArray(codProveedor) ? codProveedor : [codProveedor];
  return arr.map((c) => String(c).trim()).filter(Boolean);
}

function validateColumnsArray(columns) {
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    throw new Error('columns must be a non-empty array of column names');
  }
  for (const col of columns) {
    if (typeof col !== 'string') {
      throw new Error(`Column names must be strings. Invalid column: ${col}`);
    }
    if (!isValidColumnName(col)) {
      throw new Error(
        `Invalid column name format: ${col}. Only alphanumeric, underscore, and dot are allowed.`
      );
    }
  }
}

function parseLimit(limit, defaultMax = 1000) {
  let maxLimit = defaultMax;
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== 'number' || limit < 0) {
      throw new Error('LIMIT must be a non-negative number');
    }
    maxLimit = Math.min(limit, defaultMax);
  }
  return maxLimit;
}

/**
 * Merges server-side CodProveedor IN (...) with optional model WHERE.
 */
function mergeCodProveedorWhere(whereClause, whereParams, codes) {
  const inClause = `CodProveedor IN (${codes.map(() => '?').join(', ')})`;
  if (whereClause && whereClause.trim()) {
    return {
      clause: `(${whereClause}) AND (${inClause})`,
      params: [...whereParams, ...codes]
    };
  }
  return { clause: inClause, params: [...codes] };
}

function mapMysqlError(error, tableHint) {
  let errorMessage = error.message;
  if (error.code === 'ER_NO_SUCH_TABLE') {
    errorMessage = `Table does not exist: ${tableHint}`;
  } else if (error.code === 'ER_BAD_FIELD_ERROR') {
    errorMessage = `Invalid column name in query`;
  } else if (error.code === 'ER_PARSE_ERROR') {
    errorMessage = `SQL syntax error: ${error.message}`;
  }
  return errorMessage;
}

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {string[]}
 */
function distinctCodProveedoresFromRows(rows) {
  const set = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const v = row.CodProveedor ?? row.codProveedor;
    if (v != null && String(v).trim() !== '') {
      set.add(String(v).trim());
    }
  }
  return [...set];
}

/**
 * @param {Object} params
 * @param {string} params.nameSearch - Substring matched with LIKE on providers text columns
 * @param {number} [params.limit] - Max rows (default 100, max 100)
 */
export async function searchProvidersByName(params) {
  console.log(`🔍 searchProvidersByName:`, JSON.stringify(params, null, 2));

  if (!params || typeof params !== 'object') {
    return { success: false, error: 'Parameters must be an object', data: [], rowCount: 0 };
  }

  const nameSearch = params.nameSearch;
  if (nameSearch === undefined || nameSearch === null || String(nameSearch).trim() === '') {
    return { success: false, error: 'nameSearch is required (non-empty string)', data: [], rowCount: 0 };
  }

  let lim = 100;
  if (params.limit !== undefined && params.limit !== null) {
    if (typeof params.limit !== 'number' || params.limit < 0) {
      return { success: false, error: 'limit must be a non-negative number', data: [], rowCount: 0 };
    }
    lim = Math.min(params.limit, 100);
  }

  const pool = await getMySQLPool();
  if (!pool) {
    return { success: false, error: 'MySQL connection pool not available', data: [], rowCount: 0 };
  }

  try {
    const cols = await getProviderTextLikeColumns(pool);
    if (cols.length === 0) {
      return { success: false, error: 'No text columns found on providers table for name search.', data: [], rowCount: 0 };
    }

    const like = `%${escapeSqlLikePattern(String(nameSearch).trim())}%`;
    const parts = cols.map(() => '?? LIKE ?').join(' OR ');
    const query = `SELECT * FROM \`providers\` WHERE ${parts} LIMIT ?`;
    const bind = [];
    for (const c of cols) {
      bind.push(c, like);
    }
    bind.push(lim);

    const [rows] = await pool.query(query, bind);

    return {
      success: true,
      data: rows,
      rowCount: rows.length
    };
  } catch (error) {
    console.error('❌ searchProvidersByName:', error.message);
    return {
      success: false,
      error: mapMysqlError(error, 'providers'),
      data: [],
      rowCount: 0
    };
  }
}

/**
 * @param {Object} params
 * @param {string} params.domainTable - hotels | services | packages | winery
 * @param {string|string[]} params.codProveedor - Required provider code(s)
 * @param {string[]} params.columns
 * @param {string} [params.whereClause]
 * @param {Array} [params.whereParams]
 * @param {string} [params.orderBy]
 * @param {number} [params.limit]
 */
export async function queryOperationalData(params) {
  console.log(`🔍 queryOperationalData:`, JSON.stringify(params, null, 2));

  if (!params || typeof params !== 'object') {
    return { success: false, error: 'Parameters must be an object', data: [], rowCount: 0 };
  }

  const {
    domainTable,
    codProveedor,
    columns,
    whereClause,
    whereParams = [],
    orderBy,
    limit
  } = params;

  if (!domainTable || typeof domainTable !== 'string') {
    return { success: false, error: 'domainTable is required (hotels, services, packages, winery)', data: [], rowCount: 0 };
  }

  const table = domainTable.toLowerCase();
  if (!OPERATIONAL_TABLES.includes(table)) {
    return {
      success: false,
      error: `Invalid domainTable "${domainTable}". Allowed: ${OPERATIONAL_TABLES.join(', ')}`,
      data: [],
      rowCount: 0
    };
  }

  const codes = normalizeCodProveedorList(codProveedor);
  if (codes.length === 0) {
    return {
      success: false,
      error: 'codProveedor is required (string or array of strings)',
      data: [],
      rowCount: 0
    };
  }

  try {
    validateColumnsArray(columns);
  } catch (e) {
    return { success: false, error: e.message, data: [], rowCount: 0 };
  }

  if (whereClause && typeof whereClause !== 'string') {
    return { success: false, error: 'whereClause must be a string', data: [], rowCount: 0 };
  }
  if (!Array.isArray(whereParams)) {
    return { success: false, error: 'whereParams must be an array', data: [], rowCount: 0 };
  }
  if (orderBy && typeof orderBy !== 'string') {
    return { success: false, error: 'orderBy must be a string', data: [], rowCount: 0 };
  }
  if (orderBy && !isValidOrderBy(orderBy)) {
    return { success: false, error: `Invalid ORDER BY clause format: ${orderBy}`, data: [], rowCount: 0 };
  }

  let maxLimit;
  try {
    maxLimit = parseLimit(limit, 1000);
  } catch (e) {
    return { success: false, error: e.message, data: [], rowCount: 0 };
  }

  const pool = await getMySQLPool();
  if (!pool) {
    return { success: false, error: 'MySQL connection pool not available', data: [], rowCount: 0 };
  }

  try {
    const tableCols = await getTableColumnNames(pool, table);
    if (!tableCols.includes('CodProveedor')) {
      return { success: false, error: `Table "${table}" has no CodProveedor column`, data: [], rowCount: 0 };
    }

    if (orderBy) {
      validateOrderByAgainstSchema(orderBy, tableCols);
    }

    const { clause: effectiveWhere, params: effectiveParams } = mergeCodProveedorWhere(
      whereClause || '',
      whereParams,
      codes
    );

    const selectClause = columns.map(() => '??').join(', ');
    let query = `SELECT ${selectClause} FROM ??`;
    let queryParams = [...columns, table];

    if (effectiveWhere) {
      query += ` WHERE ${effectiveWhere}`;
      queryParams = queryParams.concat(effectiveParams);
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (maxLimit) {
      query += ` LIMIT ?`;
      queryParams.push(maxLimit);
    }

    console.log(`🔍 Executing operational query table=${table}`);
    const [rows] = await pool.query(query, queryParams);

    return {
      success: true,
      data: rows,
      rowCount: rows.length,
      domainTable: table,
      codProveedorFilter: codes
    };
  } catch (error) {
    console.error('❌ queryOperationalData:', error.message);
    if (error.message && error.message.startsWith('Invalid ORDER BY')) {
      return { success: false, error: error.message, data: [], rowCount: 0 };
    }
    return {
      success: false,
      error: mapMysqlError(error, table),
      data: [],
      rowCount: 0
    };
  }
}

/**
 * @param {Object} params
 * @param {string|string[]} params.codProveedor - Required
 * @param {string[]} params.columns
 * @param {string} [params.whereClause]
 * @param {Array} [params.whereParams]
 * @param {string} [params.orderBy]
 * @param {number} [params.limit]
 */
export async function queryProductsInformation(params) {
  console.log(`🔍 queryProductsInformation:`, JSON.stringify(params, null, 2));

  if (!params || typeof params !== 'object') {
    return { success: false, error: 'Parameters must be an object', data: [], rowCount: 0 };
  }

  const { codProveedor, columns, whereClause, whereParams = [], orderBy, limit } = params;

  const codes = normalizeCodProveedorList(codProveedor);
  if (codes.length === 0) {
    return {
      success: false,
      error: 'codProveedor is required (string or array of strings)',
      data: [],
      rowCount: 0
    };
  }

  try {
    validateColumnsArray(columns);
  } catch (e) {
    return { success: false, error: e.message, data: [], rowCount: 0 };
  }

  if (whereClause && typeof whereClause !== 'string') {
    return { success: false, error: 'whereClause must be a string', data: [], rowCount: 0 };
  }
  if (!Array.isArray(whereParams)) {
    return { success: false, error: 'whereParams must be an array', data: [], rowCount: 0 };
  }
  if (orderBy && typeof orderBy !== 'string') {
    return { success: false, error: 'orderBy must be a string', data: [], rowCount: 0 };
  }
  if (orderBy && !isValidOrderBy(orderBy)) {
    return { success: false, error: `Invalid ORDER BY clause format: ${orderBy}`, data: [], rowCount: 0 };
  }

  let maxLimit;
  try {
    maxLimit = parseLimit(limit, 1000);
  } catch (e) {
    return { success: false, error: e.message, data: [], rowCount: 0 };
  }

  const pool = await getMySQLPool();
  if (!pool) {
    return { success: false, error: 'MySQL connection pool not available', data: [], rowCount: 0 };
  }

  try {
    const tableCols = await getTableColumnNames(pool, PRODUCTS_TABLE);
    if (!tableCols.includes('CodProveedor')) {
      return { success: false, error: `Table "${PRODUCTS_TABLE}" has no CodProveedor column`, data: [], rowCount: 0 };
    }

    if (orderBy) {
      validateOrderByAgainstSchema(orderBy, tableCols);
    }

    const { clause: effectiveWhere, params: effectiveParams } = mergeCodProveedorWhere(
      whereClause || '',
      whereParams,
      codes
    );

    const selectClause = columns.map(() => '??').join(', ');
    let query = `SELECT ${selectClause} FROM ??`;
    let queryParams = [...columns, PRODUCTS_TABLE];

    if (effectiveWhere) {
      query += ` WHERE ${effectiveWhere}`;
      queryParams = queryParams.concat(effectiveParams);
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (maxLimit) {
      query += ` LIMIT ?`;
      queryParams.push(maxLimit);
    }

    console.log(`🔍 Executing products_information query`);
    const [rows] = await pool.query(query, queryParams);

    return {
      success: true,
      data: rows,
      rowCount: rows.length,
      codProveedorFilter: codes
    };
  } catch (error) {
    console.error('❌ queryProductsInformation:', error.message);
    if (error.message && error.message.startsWith('Invalid ORDER BY')) {
      return { success: false, error: error.message, data: [], rowCount: 0 };
    }
    return {
      success: false,
      error: mapMysqlError(error, PRODUCTS_TABLE),
      data: [],
      rowCount: 0
    };
  }
}

/**
 * Fallback: query all operational tables (hotels, services, packages, winery) without server-side CodProveedor filter.
 * Use when searchProvidersByName returns no rows or the user gave no provider but gave other criteria.
 *
 * @param {Object} params
 * @param {string[]} params.columns - Requested columns per table (intersection with each table; CodProveedor added when present)
 * @param {string} [params.searchText] - Optional substring; OR of LIKE on each table's text/varchar columns
 * @param {number} [params.limitPerTable] - Max rows per table (capped: 50 without searchText, 300 with searchText)
 */
export async function discoverDataWithoutProvider(params) {
  console.log(`🔍 discoverDataWithoutProvider:`, JSON.stringify(params, null, 2));

  if (!params || typeof params !== 'object') {
    return {
      success: false,
      error: 'Parameters must be an object',
      dataByTable: {},
      rowCountByTable: {},
      rowCount: 0,
      distinctCodProveedores: []
    };
  }

  const { columns, searchText, limitPerTable } = params;

  try {
    validateColumnsArray(columns);
  } catch (e) {
    return {
      success: false,
      error: e.message,
      dataByTable: {},
      rowCountByTable: {},
      rowCount: 0,
      distinctCodProveedores: []
    };
  }

  if (limitPerTable !== undefined && limitPerTable !== null) {
    if (typeof limitPerTable !== 'number' || limitPerTable < 0) {
      return {
        success: false,
        error: 'limitPerTable must be a non-negative number',
        dataByTable: {},
        rowCountByTable: {},
        rowCount: 0,
        distinctCodProveedores: []
      };
    }
  }

  if (searchText !== undefined && searchText !== null && typeof searchText !== 'string') {
    return {
      success: false,
      error: 'searchText must be a string when provided',
      dataByTable: {},
      rowCountByTable: {},
      rowCount: 0,
      distinctCodProveedores: []
    };
  }

  const hasSearch = searchText != null && String(searchText).trim() !== '';

  let maxPerTable;
  try {
    if (hasSearch) {
      maxPerTable = parseLimit(
        limitPerTable !== undefined && limitPerTable !== null ? limitPerTable : 100,
        DISCOVER_MAX_LIMIT_WITH_SEARCH
      );
    } else {
      const raw =
        limitPerTable !== undefined && limitPerTable !== null
          ? limitPerTable
          : FALLBACK_MAX_LIMIT_NO_WHERE;
      maxPerTable = Math.min(parseLimit(raw, FALLBACK_MAX_LIMIT_NO_WHERE), FALLBACK_MAX_LIMIT_NO_WHERE);
    }
  } catch (e) {
    return {
      success: false,
      error: e.message,
      dataByTable: {},
      rowCountByTable: {},
      rowCount: 0,
      distinctCodProveedores: []
    };
  }

  const pool = await getMySQLPool();
  if (!pool) {
    return {
      success: false,
      error: 'MySQL connection pool not available',
      dataByTable: {},
      rowCountByTable: {},
      rowCount: 0,
      distinctCodProveedores: []
    };
  }

  const dataByTable = {};
  const rowCountByTable = {};
  const errorsByTable = {};
  const searchTrimmed = hasSearch ? String(searchText).trim() : '';

  tableLoop: for (const table of OPERATIONAL_TABLES) {
    try {
      const tableCols = await getTableColumnNames(pool, table);
      const selectColumns = buildDiscoverSelectColumnsForTable(columns, tableCols);
      if (!selectColumns) {
        errorsByTable[table] = `No matching columns on "${table}" (and no CodProveedor column)`;
        dataByTable[table] = [];
        rowCountByTable[table] = 0;
        continue;
      }

      for (const col of selectColumns) {
        if (!isValidColumnName(col)) {
          errorsByTable[table] = `Invalid column name: ${col}`;
          dataByTable[table] = [];
          rowCountByTable[table] = 0;
          continue tableLoop;
        }
      }

      const selectClause = selectColumns.map(() => '??').join(', ');
      let query = `SELECT ${selectClause} FROM ??`;
      let queryParams = [...selectColumns, table];

      if (hasSearch) {
        const textCols = await getTableTextLikeColumns(pool, table);
        const usable = textCols.filter((c) => tableCols.includes(c));
        if (usable.length > 0) {
          const like = `%${escapeSqlLikePattern(searchTrimmed)}%`;
          const orPart = usable.map(() => '?? LIKE ?').join(' OR ');
          query += ` WHERE (${orPart})`;
          for (const c of usable) {
            queryParams.push(c, like);
          }
        }
      }

      query += ` LIMIT ?`;
      queryParams.push(maxPerTable);

      console.log(`🔍 discoverDataWithoutProvider table=${table} hasSearch=${hasSearch}`);
      const [rows] = await pool.query(query, queryParams);
      dataByTable[table] = rows;
      rowCountByTable[table] = rows.length;
    } catch (error) {
      console.error(`❌ discoverDataWithoutProvider ${table}:`, error.message);
      errorsByTable[table] = mapMysqlError(error, table);
      dataByTable[table] = [];
      rowCountByTable[table] = 0;
    }
  }

  const allRows = OPERATIONAL_TABLES.flatMap((t) => dataByTable[t] || []);
  const distinctCodProveedores = distinctCodProveedoresFromRows(allRows);
  const totalRows = allRows.length;
  const failedCount = OPERATIONAL_TABLES.filter((t) => errorsByTable[t]).length;

  if (failedCount === OPERATIONAL_TABLES.length) {
    return {
      success: false,
      error: `All operational tables failed: ${JSON.stringify(errorsByTable)}`,
      dataByTable,
      rowCountByTable,
      rowCount: 0,
      distinctCodProveedores: [],
      errorsByTable
    };
  }

  return {
    success: true,
    dataByTable,
    rowCountByTable,
    rowCount: totalRows,
    distinctCodProveedores,
    errorsByTable: Object.keys(errorsByTable).length > 0 ? errorsByTable : undefined,
    hint:
      distinctCodProveedores.length > 0
        ? 'Use distinctCodProveedor value(s) with queryProductsInformation (primary) for catalog rows, then queryOperationalData per domainTable if you need more operational fields.'
        : 'No CodProveedor in any table results; refine searchText, widen columns, or ask the user for a provider code.'
  };
}

function buildSearchProvidersToolDefinition() {
  return ToolUtility.createFunctionTool({
    name: 'searchProvidersByName',
    description:
      'Step 1: Search the providers catalog by name. Runs LIKE on text columns (e.g. Proveedor). Returns matching rows with CodProveedor and names. If rowCount is 0 or the user gave no provider, call discoverDataWithoutProvider next when other search criteria exist (it queries all four operational tables). Otherwise use the chosen CodProveedor with queryProductsInformation and queryOperationalData.',
    parameters: {
      type: 'object',
      properties: {
        nameSearch: {
          type: 'string',
          description: 'Substring to match against provider name / text fields (LIKE %search%)'
        },
        limit: {
          type: 'number',
          description: 'Max rows to return (default 100, max 100)'
        }
      },
      required: ['nameSearch']
    }
  }).definition;
}

function buildQueryOperationalToolDefinition() {
  return ToolUtility.createFunctionTool({
    name: 'queryOperationalData',
    description:
      'Step 2: Query one operational table (hotels, services, packages, winery) filtered by CodProveedor. Requires codProveedor from searchProvidersByName or from the user. Does NOT join products_information — use queryProductsInformation for product rows.',
    parameters: {
      type: 'object',
      properties: {
        domainTable: {
          type: 'string',
          enum: ['hotels', 'services', 'packages', 'winery'],
          description: 'Which operational table to query'
        },
        codProveedor: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Provider code(s); server adds CodProveedor IN (...) filter'
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Column names to SELECT (must exist on that table; winery has no Activo or Dias)'
        },
        whereClause: {
          type: 'string',
          description: 'Optional extra WHERE using ? placeholders (CodProveedor filter is added automatically)'
        },
        whereParams: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean'] },
          description: 'Values for whereClause placeholders only'
        },
        orderBy: {
          type: 'string',
          description: 'Optional ORDER BY using only real column names on that table'
        },
        limit: {
          type: 'number',
          description: 'Max rows (max 1000)'
        }
      },
      required: ['domainTable', 'codProveedor', 'columns']
    }
  }).definition;
}

function buildQueryProductsToolDefinition() {
  return ToolUtility.createFunctionTool({
    name: 'queryProductsInformation',
    description:
      'Step 3: Query products_information filtered by CodProveedor. Run after resolving the provider code. Combine results with queryOperationalData for a full answer.',
    parameters: {
      type: 'object',
      properties: {
        codProveedor: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Provider code(s); server adds CodProveedor IN (...) filter'
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Column names to SELECT from products_information'
        },
        whereClause: {
          type: 'string',
          description: 'Optional extra WHERE using ? placeholders'
        },
        whereParams: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean'] },
          description: 'Values for whereClause placeholders only'
        },
        orderBy: {
          type: 'string',
          description: 'Optional ORDER BY using only real column names'
        },
        limit: {
          type: 'number',
          description: 'Max rows (max 1000)'
        }
      },
      required: ['codProveedor', 'columns']
    }
  }).definition;
}

function buildDiscoverWithoutProviderToolDefinition() {
  return ToolUtility.createFunctionTool({
    name: 'discoverDataWithoutProvider',
    description:
      'Fallback when searchProvidersByName returns zero rows OR the user gave no provider name but gave other criteria. Always queries ALL four operational tables (hotels, services, packages, winery) in one call—no server-side CodProveedor filter. For each table, columns is intersected with that table schema and CodProveedor is included when the column exists. Optional searchText applies OR LIKE across text columns per table. Without searchText, limit per table is capped at 50. Response has dataByTable, rowCountByTable, and distinctCodProveedores (union). Next step: call queryProductsInformation with codProveedor from distinctCodProveedores; use queryOperationalData if you need more fields from a specific domain table.',
    parameters: {
      type: 'object',
      properties: {
        columns: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Columns to SELECT per table (only columns that exist on each table are used; CodProveedor is auto-added per table when present)'
        },
        searchText: {
          type: 'string',
          description:
            'Optional substring matched with LIKE across each table varchar/text columns (OR). If omitted, returns a small capped sample per table.'
        },
        limitPerTable: {
          type: 'number',
          description:
            'Max rows per table (default 50 without searchText, max 50; default 100 with searchText, max 300)'
        }
      },
      required: ['columns']
    }
  }).definition;
}

/**
 * Registers data tools and removes legacy executeSQLQuery / stale copies of these tools.
 * @param {import('@azure/ai-agents').AgentsClient} client
 * @param {string} agentId
 */
export async function ensureAgentDataToolsExist(client, agentId) {
  try {
    const agent = await client.getAgent(agentId);
    const existing = agent.tools || [];

    const filtered = existing.filter((t) => {
      if (t.type !== 'function' || !t.function?.name) return true;
      const n = t.function.name;
      if (n === 'executeSQLQuery') return false;
      if (DATA_TOOL_NAMES.includes(n)) return false;
      return true;
    });

    const newTools = [
      ...filtered,
      buildSearchProvidersToolDefinition(),
      buildDiscoverWithoutProviderToolDefinition(),
      buildQueryOperationalToolDefinition(),
      buildQueryProductsToolDefinition()
    ];

    await client.updateAgent(agentId, {
      tools: newTools
    });

    console.log(`✅ Agent data tools registered (${DATA_TOOL_NAMES.join(', ')}) for agent ${agentId}`);
  } catch (error) {
    console.error('❌ Error ensuring agent data tools:', error.message);
    throw error;
  }
}

/** @deprecated Use ensureAgentDataToolsExist */
export async function ensureSQLToolExists(client, agentId) {
  return ensureAgentDataToolsExist(client, agentId);
}
