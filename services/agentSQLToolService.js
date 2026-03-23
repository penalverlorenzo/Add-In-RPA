/**
 * Agent SQL Tool Service
 * Handles SQL query execution and tool management for Azure AI Agents
 */

import { ToolUtility } from '@azure/ai-agents';
import mysql from 'mysql2/promise';
import config from '../config/index.js';

/**
 * Gets MySQL connection pool
 * @returns {Promise<mysql.Pool|null>} MySQL connection pool
 */
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

/**
 * Validates table name against allowed tables
 * @param {string} tableName - Table name to validate
 * @returns {boolean} True if table is allowed
 */
const ALLOWED_TABLES = ['hotels', 'services', 'packages', 'winery', 'products_information', 'providers'];

/** Main domain tables that may carry CodProveedor and should get LEFT JOIN to products_information */
const MAIN_TABLES_AUTO_PRODUCT_JOIN = ['hotels', 'services', 'packages', 'winery'];

/** Tables that must scope rows by CodProveedor via providers lookup or explicit code (not the providers catalog table itself). */
const TABLES_REQUIRING_PROVIDER_LINK = ['hotels', 'services', 'packages', 'winery', 'products_information'];

const MAIN_ALIAS = 'm';
const PI_ALIAS = 'pi';

function isValidTableName(tableName) {
  return ALLOWED_TABLES.includes(tableName.toLowerCase());
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} tableName
 * @returns {Promise<string[]>}
 */
async function getTableColumnNames(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [config.mysql.database, tableName]
  );
  return rows.map((r) => r.COLUMN_NAME);
}

/**
 * Prefix unqualified column references in WHERE/ORDER BY with main alias (e.g. Activo -> m.Activo).
 * Skips tokens already prefixed with m. or pi.
 * @param {string} fragment
 * @param {string[]} mainColumnNames
 * @returns {string}
 */
function qualifyClauseIdentifiersForMain(fragment, mainColumnNames) {
  if (!fragment || typeof fragment !== 'string') return fragment;
  let result = fragment;
  const sorted = [...mainColumnNames].sort((a, b) => b.length - a.length);
  const mainPrefix = `${MAIN_ALIAS}.`;
  const piPrefix = `${PI_ALIAS}.`;
  for (const col of sorted) {
    if (!col || col.includes('.')) continue;
    result = result.replace(new RegExp(`\\b${escapeRegex(col)}\\b`, 'g'), (match, offset, string) => {
      if (string.slice(offset - mainPrefix.length, offset) === mainPrefix) return match;
      if (string.slice(offset - piPrefix.length, offset) === piPrefix) return match;
      return `${MAIN_ALIAS}.${match}`;
    });
  }
  return result;
}

/**
 * Whether to auto LEFT JOIN products_information on CodProveedor for this query.
 * @param {Object} params
 * @param {string} validTableName - normalized lowercase main table
 * @param {Array} joins
 * @returns {boolean}
 */
function shouldAutoJoinProductsInformation(params, validTableName, joins) {
  if (params.includeProductInformation === false) {
    return false;
  }
  if (!MAIN_TABLES_AUTO_PRODUCT_JOIN.includes(validTableName)) {
    return false;
  }
  if (validTableName === 'products_information' || validTableName === 'providers') {
    return false;
  }
  const hasPiJoin = (joins || []).some(
    (j) => j.table && j.table.toLowerCase() === 'products_information'
  );
  if (hasPiJoin) {
    return false;
  }
  return true;
}

/**
 * Validates column names to prevent SQL injection
 * @param {string} columnName - Column name to validate
 * @returns {boolean} True if column name is valid
 */
function isValidColumnName(columnName) {
  return /^[a-zA-Z0-9_.]+$/.test(columnName);
}

/**
 * Validates ORDER BY clause to prevent SQL injection
 * @param {string} orderBy - ORDER BY clause to validate
 * @returns {boolean} True if ORDER BY is valid
 */
function isValidOrderBy(orderBy) {
  return /^[a-zA-Z0-9_.\s,]+(ASC|DESC)?$/i.test(orderBy.trim());
}

/**
 * Bare identifiers referenced in ORDER BY (last segment if table-qualified).
 * @param {string} orderBy
 * @returns {string[]}
 */
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

/**
 * @param {string} id - bare identifier from ORDER BY
 * @param {string[]} mainCols
 * @param {string[]} piCols - products_information columns when auto-join applies
 * @returns {boolean}
 */
function isAllowedOrderIdentifier(id, mainCols, piCols) {
  const idLower = id.toLowerCase();
  if ((mainCols || []).some((c) => c && c.toLowerCase() === idLower)) {
    return true;
  }
  for (const c of piCols || []) {
    if (!c) continue;
    if (c.toLowerCase() === idLower) return true;
    if (`pi_${c}`.toLowerCase() === idLower) return true;
  }
  return false;
}

/**
 * Rejects invented sort columns so the model must stick to INFORMATION_SCHEMA-backed names.
 * @param {string} orderBy
 * @param {string[]} mainCols
 * @param {string[]} piCols
 */
function validateOrderByAgainstSchema(orderBy, mainCols, piCols) {
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
  if (identifiers.length === 0) {
    return;
  }
  const unknown = [...new Set(identifiers)].filter(
    (id) => !isAllowedOrderIdentifier(id, mainCols, piCols)
  );
  if (unknown.length > 0) {
    const hint =
      piCols && piCols.length > 0
        ? ' or on joined product data (DB column names or pi_<column> aliases).'
        : '.';
    throw new Error(
      `Invalid ORDER BY: unknown column(s): ${unknown.join(', ')}. Use only columns that exist on the queried table${hint}`
    );
  }
}

/**
 * VARCHAR/TEXT columns on providers used to match providerSearchText (excludes id).
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string[]>}
 */
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

function escapeSqlLikePattern(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * DISTINCT CodProveedor where any text column matches search (LIKE %search%).
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} searchText
 * @returns {Promise<string[]>}
 */
async function searchCodProveedoresByText(pool, searchText) {
  const cols = await getProviderTextLikeColumns(pool);
  if (cols.length === 0) {
    throw new Error('No text columns found on providers table for name search.');
  }
  const like = `%${escapeSqlLikePattern(searchText)}%`;
  const parts = cols.map(() => '?? LIKE ?').join(' OR ');
  const query = `SELECT DISTINCT \`CodProveedor\` FROM \`providers\` WHERE ${parts}`;
  const bind = [];
  for (const c of cols) {
    bind.push(c, like);
  }
  const [rows] = await pool.query(query, bind);
  return rows
    .map((r) => r.CodProveedor)
    .filter((v) => v != null && String(v).trim() !== '');
}

/**
 * Detects CodProveedor equality filters already present in WHERE (? placeholders aligned with whereParams).
 * Matches CodProveedor = ? or m.CodProveedor = ? (main alias when auto-join qualifies the clause).
 * @param {string} [whereClause]
 * @param {Array} [whereParams]
 * @returns {string[]|null} distinct non-empty bound codes, or null if none
 */
function extractCodProveedorEqualityFromWhere(whereClause, whereParams) {
  if (!whereClause || typeof whereClause !== 'string' || !Array.isArray(whereParams)) {
    return null;
  }
  const qPositions = [];
  for (let i = 0; i < whereClause.length; i++) {
    if (whereClause[i] === '?') qPositions.push(i);
  }
  if (qPositions.length !== whereParams.length) {
    return null;
  }
  const found = [];
  for (let p = 0; p < qPositions.length; p++) {
    const before = whereClause.slice(0, qPositions[p]).trimEnd();
    if (/\b(?:m\.)?CodProveedor\s*=\s*$/i.test(before)) {
      const v = whereParams[p];
      if (v != null && String(v).trim() !== '') {
        found.push(String(v).trim());
      }
    }
  }
  if (found.length === 0) return null;
  return [...new Set(found)];
}

/**
 * @typedef {{ type: 'skip' }} ProviderContextSkip
 * @typedef {{ type: 'merge', codes: string[], strategy: 'explicit'|'search' }} ProviderContextMerge
 * @typedef {{ type: 'where_ok', codes: string[] }} ProviderContextWhereOk
 */

/**
 * Resolves provider scoping: skip, merge IN (...), or satisfied by CodProveedor = ? in whereClause.
 * @param {import('mysql2/promise').Pool} pool
 * @param {Object} params
 * @returns {Promise<ProviderContextSkip|ProviderContextMerge|ProviderContextWhereOk>}
 */
async function resolveProviderContext(pool, params) {
  if (params.skipProviderFilter === true) {
    return { type: 'skip' };
  }
  const fromWhere = extractCodProveedorEqualityFromWhere(params.whereClause, params.whereParams);
  if (fromWhere && fromWhere.length > 0) {
    console.log(
      `📋 Provider context: satisfied by WHERE (CodProveedor = ?) bound to: ${fromWhere.join(', ')}`
    );
    return { type: 'where_ok', codes: fromWhere };
  }
  const { codProveedor, providerSearchText } = params;
  if (codProveedor !== undefined && codProveedor !== null) {
    const arr = Array.isArray(codProveedor) ? codProveedor : [codProveedor];
    const out = arr.map((c) => String(c).trim()).filter(Boolean);
    if (out.length === 0) {
      throw new Error('codProveedor was provided but is empty.');
    }
    return { type: 'merge', codes: out, strategy: 'explicit' };
  }
  if (providerSearchText !== undefined && providerSearchText !== null && String(providerSearchText).trim() !== '') {
    const codes = await searchCodProveedoresByText(pool, String(providerSearchText).trim());
    return { type: 'merge', codes, strategy: 'search' };
  }
  throw new Error(
    'For hotels, services, packages, winery, and products_information you must supply one of: providerSearchText (search in providers), codProveedor (top-level), CodProveedor = ? with the value in whereParams, or skipProviderFilter: true to list all rows without a provider filter.'
  );
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} tableName
 */
async function assertTableHasCodProveedor(pool, tableName) {
  const cols = await getTableColumnNames(pool, tableName);
  if (!cols.includes('CodProveedor')) {
    throw new Error(
      `Table "${tableName}" has no CodProveedor column; cannot apply provider filter. Query providers directly instead.`
    );
  }
}

/**
 * Executes a SQL query safely
 * @param {Object} params - Query parameters
 * @param {string} params.tableName - Main table name
 * @param {string[]} params.columns - Columns to select
 * @param {Array} params.joins - Optional JOIN clauses
 * @param {string} params.whereClause - Optional WHERE clause
 * @param {Array} params.whereParams - Parameters for WHERE clause
 * @param {string} params.orderBy - Optional ORDER BY clause
 * @param {number} params.limit - Optional LIMIT
 * @param {boolean} [params.includeProductInformation] - If false, skip auto LEFT JOIN to products_information (default true)
 * @param {string} [params.providerSearchText] - Search text against providers text columns; resolves CodProveedor before querying main table
 * @param {string|string[]} [params.codProveedor] - Known provider code(s); skips providers name search
 * @param {boolean} [params.skipProviderFilter] - If true, do not require provider resolution (list-all / admin)
 * @remarks If whereClause contains CodProveedor = ? (or m.CodProveedor = ?) with the matching entry in whereParams, provider scoping is satisfied without duplicating an IN filter.
 * @returns {Promise<Object>} Query results
 */
export async function executeSQLQuery(params) {
  console.log(`🔍 executeSQLQuery called with params:`, JSON.stringify(params, null, 2));

  if (!params || typeof params !== 'object') {
    throw new Error('Parameters must be an object');
  }

  const {
    tableName,
    columns,
    joins = [],
    whereClause,
    whereParams = [],
    orderBy,
    limit
  } = params;

  if (!tableName || typeof tableName !== 'string') {
    console.error(`❌ Invalid tableName:`, {
      tableName,
      type: typeof tableName,
      isNull: tableName === null,
      isUndefined: tableName === undefined
    });
    throw new Error(
      'Table name is required and must be a string. Please specify one of: hotels, services, packages, winery, providers, or products_information.'
    );
  }

  const normalizedTableName = tableName.toLowerCase();

  if (!isValidTableName(normalizedTableName)) {
    console.error(`❌ Invalid table name: ${tableName}. Allowed: ${ALLOWED_TABLES.join(', ')}`);
    throw new Error(`Invalid table name: "${tableName}". Allowed tables are: ${ALLOWED_TABLES.join(', ')}.`);
  }

  const validTableName = normalizedTableName;

  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    throw new Error('At least one column must be specified as an array');
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

  if (joins && !Array.isArray(joins)) {
    throw new Error('Joins must be an array');
  }

  if (joins && joins.length > 0) {
    for (const join of joins) {
      if (!join.table || typeof join.table !== 'string') {
        throw new Error('JOIN must have a valid table name');
      }
      const normalizedJoinTable = join.table.toLowerCase();
      if (!isValidTableName(normalizedJoinTable)) {
        throw new Error(
          `Invalid JOIN table name: ${join.table}. Allowed tables are: ${ALLOWED_TABLES.join(', ')}.`
        );
      }
      if (!join.on || typeof join.on !== 'string') {
        throw new Error('JOIN must have a valid ON clause');
      }
      if (!/^[a-zA-Z0-9_.\s=<>!]+$/.test(join.on)) {
        throw new Error(`Invalid JOIN ON clause format: ${join.on}`);
      }
    }
  }

  if (whereClause && typeof whereClause !== 'string') {
    throw new Error('WHERE clause must be a string');
  }

  if (whereParams && !Array.isArray(whereParams)) {
    throw new Error('WHERE parameters must be an array');
  }

  if (orderBy && typeof orderBy !== 'string') {
    throw new Error('ORDER BY must be a string');
  }

  if (orderBy && !isValidOrderBy(orderBy)) {
    throw new Error(`Invalid ORDER BY clause format: ${orderBy}`);
  }

  let maxLimit = 1000;
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== 'number' || limit < 0) {
      throw new Error('LIMIT must be a non-negative number');
    }
    maxLimit = Math.min(limit, 1000);
  }

  const pool = await getMySQLPool();
  if (!pool) {
    throw new Error('MySQL connection pool not available');
  }

  try {
    let useProductJoin = false;
    let mainColumnNames = [];
    let piColsForSelect = [];

    if (shouldAutoJoinProductsInformation(params, validTableName, joins)) {
      const [mainCols, piCols] = await Promise.all([
        getTableColumnNames(pool, validTableName),
        getTableColumnNames(pool, 'products_information')
      ]);
      const hasMain = mainCols.includes('CodProveedor');
      const hasPi = piCols.includes('CodProveedor');
      if (hasMain && hasPi) {
        useProductJoin = true;
        mainColumnNames = mainCols;
        piColsForSelect = piCols;
        console.log(
          `🔗 Auto LEFT JOIN: ${validTableName} AS ${MAIN_ALIAS} -> products_information AS ${PI_ALIAS} ON CodProveedor`
        );
      } else {
        console.log(
          `ℹ️ Skipping auto product JOIN: CodProveedor on main=${hasMain}, products_information=${hasPi}`
        );
      }
    }

    let effectiveWhere = whereClause;
    let effectiveWhereParams = [...whereParams];
    /** @type {{ strategy: string, matchedCodProveedores: string[]|null }|null} */
    let providerResolutionMeta = null;

    if (TABLES_REQUIRING_PROVIDER_LINK.includes(validTableName)) {
      if (params.skipProviderFilter !== true) {
        await assertTableHasCodProveedor(pool, validTableName);
      }
      const ctx = await resolveProviderContext(pool, params);
      if (ctx.type === 'skip') {
        providerResolutionMeta = { strategy: 'skipped', matchedCodProveedores: null };
      } else if (ctx.type === 'where_ok') {
        providerResolutionMeta = {
          strategy: 'where_clause',
          matchedCodProveedores: ctx.codes
        };
      } else if (ctx.type === 'merge') {
        if (ctx.codes.length === 0) {
          providerResolutionMeta = { strategy: ctx.strategy, matchedCodProveedores: [] };
          console.log(`📋 Provider resolution: no CodProveedor matched (strategy=${ctx.strategy})`);
          return {
            success: true,
            data: [],
            rowCount: 0,
            providerResolution: providerResolutionMeta
          };
        }
        const inClause = `CodProveedor IN (${ctx.codes.map(() => '?').join(', ')})`;
        if (effectiveWhere && effectiveWhere.trim()) {
          effectiveWhere = `(${effectiveWhere}) AND (${inClause})`;
        } else {
          effectiveWhere = inClause;
        }
        effectiveWhereParams = [...effectiveWhereParams, ...ctx.codes];
        providerResolutionMeta = { strategy: ctx.strategy, matchedCodProveedores: ctx.codes };
        console.log(
          `📋 Provider resolution: ${ctx.codes.length} CodProveedor value(s) (strategy=${ctx.strategy})`
        );
      }
    }

    let mainColsForOrderBy = mainColumnNames;
    if (orderBy) {
      if (mainColsForOrderBy.length === 0) {
        mainColsForOrderBy = await getTableColumnNames(pool, validTableName);
      }
      validateOrderByAgainstSchema(
        orderBy,
        mainColsForOrderBy,
        useProductJoin ? piColsForSelect : []
      );
    }

    let query;
    let queryParams;

    if (useProductJoin) {
      const selectFragments = [];
      queryParams = [];

      for (const col of columns) {
        if (col.includes('.')) {
          selectFragments.push('??');
          queryParams.push(col);
        } else {
          selectFragments.push(`\`${MAIN_ALIAS}\`.??`);
          queryParams.push(col);
        }
      }

      for (const piCol of piColsForSelect) {
        const outAlias = `pi_${piCol}`;
        selectFragments.push(`\`${PI_ALIAS}\`.?? AS ??`);
        queryParams.push(piCol, outAlias);
      }

      query = `SELECT ${selectFragments.join(', ')} FROM ?? AS \`${MAIN_ALIAS}\``;
      queryParams.push(validTableName);

      query += ` LEFT JOIN ?? AS \`${PI_ALIAS}\` ON \`${MAIN_ALIAS}\`.\`CodProveedor\` = \`${PI_ALIAS}\`.\`CodProveedor\``;
      queryParams.push('products_information');

      if (joins && joins.length > 0) {
        for (const join of joins) {
          const joinType = (join.type || 'INNER').toUpperCase();
          if (!['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(joinType)) {
            throw new Error(`Invalid JOIN type: ${join.type}. Must be INNER, LEFT, RIGHT, or FULL`);
          }

          const normalizedJoinTable = join.table.toLowerCase();
          let onClause = join.on;
          const onParts = onClause.split(/\s*(=|<|>|<=|>=|!=)\s*/);
          const onPlaceholders = [];

          for (let i = 0; i < onParts.length; i += 2) {
            const part = onParts[i]?.trim();
            if (part && isValidColumnName(part)) {
              onPlaceholders.push(part);
              onParts[i] = '??';
            }
          }

          if (onPlaceholders.length > 0) {
            onClause = onParts.join(' ');
          }

          query += ` ${joinType} JOIN ?? ON ${onClause}`;
          queryParams.push(normalizedJoinTable);
          if (onPlaceholders.length > 0) {
            queryParams = queryParams.concat(onPlaceholders);
          }
        }
      }

      let qualifiedWhere = effectiveWhere;
      if (effectiveWhere && mainColumnNames.length > 0) {
        qualifiedWhere = qualifyClauseIdentifiersForMain(effectiveWhere, mainColumnNames);
      }

      if (qualifiedWhere) {
        query += ` WHERE ${qualifiedWhere}`;
        queryParams = queryParams.concat(effectiveWhereParams);
      }

      let qualifiedOrderBy = orderBy;
      if (orderBy && mainColumnNames.length > 0) {
        qualifiedOrderBy = qualifyClauseIdentifiersForMain(orderBy, mainColumnNames);
      }

      if (qualifiedOrderBy) {
        if (!isValidOrderBy(qualifiedOrderBy)) {
          throw new Error(`Invalid ORDER BY clause format after qualification: ${qualifiedOrderBy}`);
        }
        query += ` ORDER BY ${qualifiedOrderBy}`;
      }

      if (maxLimit) {
        query += ` LIMIT ?`;
        queryParams.push(maxLimit);
      }
    } else {
      const selectClause = columns.map(() => `??`).join(', ');
      const selectValues = columns;

      query = `SELECT ${selectClause} FROM ??`;
      queryParams = [...selectValues, validTableName];

      if (joins && joins.length > 0) {
        for (const join of joins) {
          const joinType = (join.type || 'INNER').toUpperCase();
          if (!['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(joinType)) {
            throw new Error(`Invalid JOIN type: ${join.type}. Must be INNER, LEFT, RIGHT, or FULL`);
          }

          const normalizedJoinTable = join.table.toLowerCase();
          let onClause = join.on;
          const onParts = onClause.split(/\s*(=|<|>|<=|>=|!=)\s*/);
          const onPlaceholders = [];

          for (let i = 0; i < onParts.length; i += 2) {
            const part = onParts[i]?.trim();
            if (part && isValidColumnName(part)) {
              onPlaceholders.push(part);
              onParts[i] = '??';
            }
          }

          if (onPlaceholders.length > 0) {
            onClause = onParts.join(' ');
          }

          query += ` ${joinType} JOIN ?? ON ${onClause}`;
          queryParams.push(normalizedJoinTable);
          if (onPlaceholders.length > 0) {
            queryParams = queryParams.concat(onPlaceholders);
          }
        }
      }

      if (effectiveWhere) {
        query += ` WHERE ${effectiveWhere}`;
        queryParams = queryParams.concat(effectiveWhereParams);
      }

      if (orderBy) {
        query += ` ORDER BY ${orderBy}`;
      }

      if (maxLimit) {
        query += ` LIMIT ?`;
        queryParams.push(maxLimit);
      }
    }

    console.log(`🔍 Executing SQL query:`);
    console.log(`   Query: ${query}`);
    console.log(
      `   Note: ?? are identifier placeholders filled from bound parameters (safe); values use ?.`
    );
    console.log(`   Parameters count: ${queryParams.length}`);
    console.log(`   Table: ${validTableName}`);
    console.log(`   Columns: ${columns.join(', ')}`);

    const [rows] = await pool.query(query, queryParams);

    return {
      success: true,
      data: rows,
      rowCount: rows.length,
      ...(useProductJoin ? { productInformationJoinApplied: true } : {}),
      ...(providerResolutionMeta ? { providerResolution: providerResolutionMeta } : {})
    };
  } catch (error) {
    console.error('❌ Error executing SQL query:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error errno:', error.errno);

    let errorMessage = error.message;
    if (error.code === 'ER_NO_SUCH_TABLE') {
      errorMessage = `Table does not exist: ${tableName}`;
    } else if (error.code === 'ER_BAD_FIELD_ERROR') {
      errorMessage = `Invalid column name in query`;
    } else if (error.code === 'ER_PARSE_ERROR') {
      errorMessage = `SQL syntax error: ${error.message}`;
    }

    return {
      success: false,
      error: errorMessage,
      data: []
    };
  }
}

/**
 * Ensures the SQL tool exists in the agent
 * @param {import('@azure/ai-agents').AgentsClient} client - AgentsClient instance
 * @param {string} agentId - Agent ID
 * @returns {Promise<void>}
 */
export async function ensureSQLToolExists(client, agentId) {
  try {
    const agent = await client.getAgent(agentId);
    const toolName = 'executeSQLQuery';

    if (agent.tools && Array.isArray(agent.tools)) {
      const toolExists = agent.tools.some(
        (tool) => tool.type === 'function' && tool.function?.name === toolName
      );

      if (toolExists) {
        console.log(`✅ SQL tool "${toolName}" already exists in agent`);
        return;
      }
    }

    const sqlTool = ToolUtility.createFunctionTool({
      name: toolName,
      description:
        'Executes SQL SELECT queries on MySQL. REQUIRED: tableName and columns (array). For hotels, services, packages, winery, and products_information you MUST scope by provider using any one of: (1) providerSearchText — server searches providers text columns and adds CodProveedor IN (...); (2) top-level codProveedor; (3) CodProveedor = ? in whereClause with the code in whereParams (same as top-level, no duplicate filter); (4) skipProviderFilter true only for rare list-all queries. Providers table columns: Proveedor (text, name), CodProveedor (varchar, business key). For main tables hotels, services, packages, and winery, the server may auto LEFT JOIN products_information on CodProveedor; columns use pi_ prefix. Winery has no Activo column; do not select or filter columns that are not in the schema. Always filter Activo = ACTIVADO when that column exists.',
      parameters: {
        type: 'object',
        properties: {
          tableName: {
            type: 'string',
            description:
              'Main table: hotels, services, packages, winery, products_information, or providers (lowercase).'
          },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Columns to select from the main table. When auto product join applies, all products_information columns are also returned as pi_<columnName>.'
          },
          providerSearchText: {
            type: 'string',
            description:
              'Substring search on providers.Proveedor (and other text columns). Server resolves CodProveedor and adds IN filter unless you already bound CodProveedor in whereClause.'
          },
          codProveedor: {
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            description:
              'Known provider code(s). Alternative: use whereClause "CodProveedor = ?" and put the code in whereParams (counts as provider scope).'
          },
          skipProviderFilter: {
            type: 'boolean',
            description:
              'If true, no provider scope required. Use only for rare list-all queries.'
          },
          includeProductInformation: {
            type: 'boolean',
            description:
              'Optional. Default true. If false, disables automatic LEFT JOIN to products_information for hotels/services/packages/winery.'
          },
          joins: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['INNER', 'LEFT', 'RIGHT', 'FULL'],
                  description: 'Type of JOIN'
                },
                table: {
                  type: 'string',
                  description: 'Table name to join'
                },
                on: {
                  type: 'string',
                  description: 'JOIN condition (e.g., "table1.id = table2.table1_id")'
                }
              },
              required: ['table', 'on']
            },
            description: 'Optional extra JOIN clauses (after any automatic product join)'
          },
          whereClause: {
            type: 'string',
            description:
              'Optional WHERE. For operational tables, "CodProveedor = ?" with the code in whereParams satisfies provider scoping (no extra server IN). Unqualified names are qualified to alias m when auto product join runs.'
          },
          whereParams: {
            type: 'array',
            items: { type: ['string', 'number', 'boolean'] },
            description: 'Parameters for WHERE placeholders'
          },
          orderBy: {
            type: 'string',
            description:
              'Optional ORDER BY using ONLY columns that exist on the main table (or products_information columns / pi_<col> aliases when the automatic product join applies). Do not invent names (e.g. Dias) unless that column exists in the schema.'
          },
          limit: {
            type: 'number',
            description: 'Max rows (max 1000)'
          }
        },
        required: ['tableName', 'columns']
      }
    });

    const existingTools = agent.tools || [];

    await client.updateAgent(agentId, {
      tools: [...existingTools, sqlTool.definition]
    });

    console.log(`✅ SQL tool "${toolName}" added to agent ${agentId}`);
  } catch (error) {
    console.error('❌ Error ensuring SQL tool exists:', error.message);
    throw error;
  }
}
