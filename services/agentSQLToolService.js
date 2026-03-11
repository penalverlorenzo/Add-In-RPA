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

  return mysql.createPool(poolConfig);
}

/**
 * Validates table name against allowed tables
 * @param {string} tableName - Table name to validate
 * @returns {boolean} True if table is allowed
 */
const ALLOWED_TABLES = ['hotels', 'services', 'packages', 'winery', 'sale_rates'];

function isValidTableName(tableName) {
  return ALLOWED_TABLES.includes(tableName.toLowerCase());
}

/**
 * Validates column names to prevent SQL injection
 * @param {string} columnName - Column name to validate
 * @returns {boolean} True if column name is valid
 */
function isValidColumnName(columnName) {
  // Allow alphanumeric, underscore, and dot (for table.column)
  return /^[a-zA-Z0-9_.]+$/.test(columnName);
}

/**
 * Validates ORDER BY clause to prevent SQL injection
 * @param {string} orderBy - ORDER BY clause to validate
 * @returns {boolean} True if ORDER BY is valid
 */
function isValidOrderBy(orderBy) {
  // Allow alphanumeric, underscore, dot, space, ASC, DESC, comma
  return /^[a-zA-Z0-9_.\s,]+(ASC|DESC)?$/i.test(orderBy.trim());
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
 * @returns {Promise<Object>} Query results
 */
export async function executeSQLQuery(params) {
  console.log(`🔍 executeSQLQuery called with params:`, JSON.stringify(params, null, 2));
  
  // Validate params object
  if (!params || typeof params !== 'object') {
    throw new Error('Parameters must be an object');
  }
  
  const { tableName, columns, joins = [], whereClause, whereParams = [], orderBy, limit } = params;

  // Validate table name
  if (!tableName || typeof tableName !== 'string') {
    console.error(`❌ Invalid tableName:`, { 
      tableName, 
      type: typeof tableName, 
      isNull: tableName === null, 
      isUndefined: tableName === undefined 
    });
    throw new Error('Table name is required and must be a string. Please specify one of: hotels, services, packages, winery, or sale_rates.');
  }

  // Normalize table name to lowercase for comparison
  const normalizedTableName = tableName.toLowerCase();

  if (!isValidTableName(normalizedTableName)) {
    console.error(`❌ Invalid table name: ${tableName}. Allowed: ${ALLOWED_TABLES.join(', ')}`);
    throw new Error(`Invalid table name: "${tableName}". Allowed tables are: ${ALLOWED_TABLES.join(', ')}.`);
  }
  
  // Use normalized name for query
  const validTableName = normalizedTableName;

  // Validate columns
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    throw new Error('At least one column must be specified as an array');
  }

  // Validate each column name
  for (const col of columns) {
    if (typeof col !== 'string') {
      throw new Error(`Column names must be strings. Invalid column: ${col}`);
    }
    if (!isValidColumnName(col)) {
      throw new Error(`Invalid column name format: ${col}. Only alphanumeric, underscore, and dot are allowed.`);
    }
  }

  // Validate joins
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
        throw new Error(`Invalid JOIN table name: ${join.table}. Allowed tables are: ${ALLOWED_TABLES.join(', ')}.`);
      }
      if (!join.on || typeof join.on !== 'string') {
        throw new Error('JOIN must have a valid ON clause');
      }
      // Validate ON clause contains only safe characters (alphanumeric, underscore, dot, space, =, <, >, <=, >=, !=)
      if (!/^[a-zA-Z0-9_.\s=<>!]+$/.test(join.on)) {
        throw new Error(`Invalid JOIN ON clause format: ${join.on}`);
      }
    }
  }

  // Validate WHERE clause
  if (whereClause && typeof whereClause !== 'string') {
    throw new Error('WHERE clause must be a string');
  }

  // Validate WHERE params
  if (whereParams && !Array.isArray(whereParams)) {
    throw new Error('WHERE parameters must be an array');
  }

  // Validate ORDER BY
  if (orderBy && typeof orderBy !== 'string') {
    throw new Error('ORDER BY must be a string');
  }

  if (orderBy && !isValidOrderBy(orderBy)) {
    throw new Error(`Invalid ORDER BY clause format: ${orderBy}`);
  }

  // Validate and limit results for safety
  let maxLimit = 1000; // Default limit
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== 'number' || limit < 0) {
      throw new Error('LIMIT must be a non-negative number');
    }
    maxLimit = Math.min(limit, 1000); // Cap at 1000
  }

  const pool = await getMySQLPool();
  if (!pool) {
    throw new Error('MySQL connection pool not available');
  }

  try {
    // Build SELECT clause with safe column names using placeholders
    const selectClause = columns.map(() => `??`).join(', ');
    const selectValues = columns;

    // Build FROM clause
    let query = `SELECT ${selectClause} FROM ??`;
    let queryParams = [...selectValues, validTableName];

    // Build JOIN clauses
    if (joins && joins.length > 0) {
      for (const join of joins) {
        const joinType = (join.type || 'INNER').toUpperCase();
        if (!['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(joinType)) {
          throw new Error(`Invalid JOIN type: ${join.type}. Must be INNER, LEFT, RIGHT, or FULL`);
        }
        
        // Normalize join table name
        const normalizedJoinTable = join.table.toLowerCase();
        
        // Parse ON clause to use placeholders for column names
        // ON clause format: "table1.column1 = table2.column2" or "column1 = column2"
        // We'll try to replace column references with placeholders
        let onClause = join.on;
        const onParts = onClause.split(/\s*(=|<|>|<=|>=|!=)\s*/);
        const onPlaceholders = [];
        
        // Simple parsing: if it looks like "table.column" or "column", use placeholder
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

    // Build WHERE clause (use placeholders for values)
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
      queryParams = queryParams.concat(whereParams);
    }

    // Build ORDER BY clause (validated but not parameterized as it's a clause, not a value)
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    // Build LIMIT clause
    if (maxLimit) {
      query += ` LIMIT ?`;
      queryParams.push(maxLimit);
    }

    console.log(`🔍 Executing SQL query:`);
    console.log(`   Query: ${query}`);
    console.log(`   Parameters count: ${queryParams.length}`);
    console.log(`   Table: ${validTableName}`);
    console.log(`   Columns: ${columns.join(', ')}`);

    const [rows] = await pool.query(query, queryParams);

    return {
      success: true,
      data: rows,
      rowCount: rows.length
    };
  } catch (error) {
    console.error('❌ Error executing SQL query:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error errno:', error.errno);
    
    // Return user-friendly error message
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

    // Check if tool already exists
    if (agent.tools && Array.isArray(agent.tools)) {
      const toolExists = agent.tools.some(tool => 
        tool.type === 'function' && tool.function?.name === toolName
      );

      if (toolExists) {
        console.log(`✅ SQL tool "${toolName}" already exists in agent`);
        return;
      }
    }

    // Create the SQL tool definition
    const sqlTool = ToolUtility.createFunctionTool({
      name: toolName,
      description: 'Executes SQL SELECT queries on the MySQL database. REQUIRED parameters: tableName (must be "hotels", "services", "packages", "winery", or "sale_rates") and columns (array of column names). Supports JOINs, WHERE clauses, ORDER BY, and LIMIT. Returns query results as JSON. Always filter by Activo = "ACTIVADO" when that column exists.',
      parameters: {
        type: 'object',
        properties: {
          tableName: {
            type: 'string',
            description: 'REQUIRED: Name of the main table for the FROM clause. Must be exactly one of: "hotels", "services", "packages", "winery", or "sale_rates" (lowercase).'
          },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'REQUIRED: Array of column names to select. Example: ["HotelID", "NombreHotel", "Precio", "Moneda"] for hotels table, or ["ServicioID", "NombreServicio", "Precio"] for services table.'
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
            description: 'Array of optional JOIN clauses'
          },
          whereClause: {
            type: 'string',
            description: 'Optional WHERE clause condition (e.g., "status = ? AND created_at > ?"). Use ? for parameter placeholders.'
          },
          whereParams: {
            type: 'array',
            items: { type: ['string', 'number', 'boolean'] },
            description: 'Parameters for the WHERE clause placeholders'
          },
          orderBy: {
            type: 'string',
            description: 'Optional ORDER BY clause (e.g., "created_at DESC")'
          },
          limit: {
            type: 'number',
            description: 'Optional limit for number of results (max 1000)'
          }
        },
        required: ['tableName', 'columns']
      }
    });

    // Get existing tools
    const existingTools = agent.tools || [];

    // Update agent with new tool
    await client.updateAgent(agentId, {
      tools: [...existingTools, sqlTool.definition]
    });

    console.log(`✅ SQL tool "${toolName}" added to agent ${agentId}`);
  } catch (error) {
    console.error('❌ Error ensuring SQL tool exists:', error.message);
    throw error;
  }
}
