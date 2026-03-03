/**
 * Agent Prompt Service
 * Handles updating the agent's system prompt with current database table structures
 */

import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import mysql from 'mysql2/promise';
import fs from 'fs';
import config from '../config/index.js';

let connectionPool = null;

/**
 * Gets MySQL connection pool
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
 * Gets the complete structure of a table from MySQL
 * @param {string} tableName - Name of the table
 * @returns {Promise<Array>} Array of column information objects
 */
async function getTableStructure(tableName) {
  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return [];
  }

  try {
    const query = `
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COLUMN_KEY,
        EXTRA,
        COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;
    
    const [rows] = await pool.query(query, [config.mysql.database, tableName]);
    return rows;
  } catch (error) {
    console.error(`❌ Error getting structure for table ${tableName}:`, error.message);
    return [];
  }
}

/**
 * Gets structures for all three tables (hotels, services, packages)
 * @returns {Promise<Object>} Object with table structures
 */
export async function getAllTableStructures() {
  console.log('📊 Obteniendo estructuras de tablas desde MySQL...');
  
  const [hotelsStructure, servicesStructure, packagesStructure] = await Promise.all([
    getTableStructure('hotels'),
    getTableStructure('services'),
    getTableStructure('packages')
  ]);

  return {
    hotels: hotelsStructure,
    services: servicesStructure,
    packages: packagesStructure
  };
}

/**
 * Formats a column definition for prompt (bullet list format)
 * @param {Object} column - Column information from INFORMATION_SCHEMA
 * @returns {string} Formatted column definition
 */
function formatColumnForPrompt(column) {
  let definition = `- ${column.COLUMN_NAME} (`;
  
  // Data type with proper formatting
  if (column.DATA_TYPE === 'varchar' || column.DATA_TYPE === 'char') {
    definition += `${column.DATA_TYPE}(${column.CHARACTER_MAXIMUM_LENGTH || 255})`;
  } else if (column.DATA_TYPE === 'decimal' || column.DATA_TYPE === 'numeric') {
    // Include precision and scale if available
    if (column.NUMERIC_PRECISION && column.NUMERIC_SCALE !== null) {
      definition += `${column.DATA_TYPE}(${column.NUMERIC_PRECISION},${column.NUMERIC_SCALE})`;
    } else {
      definition += column.DATA_TYPE;
    }
  } else if (column.DATA_TYPE === 'int' || column.DATA_TYPE === 'bigint' || column.DATA_TYPE === 'tinyint' || column.DATA_TYPE === 'smallint' || column.DATA_TYPE === 'mediumint') {
    definition += column.DATA_TYPE;
  } else if (column.DATA_TYPE === 'datetime' || column.DATA_TYPE === 'timestamp' || column.DATA_TYPE === 'date' || column.DATA_TYPE === 'time') {
    definition += column.DATA_TYPE;
  } else if (column.DATA_TYPE === 'text' || column.DATA_TYPE === 'longtext' || column.DATA_TYPE === 'mediumtext' || column.DATA_TYPE === 'tinytext') {
    definition += column.DATA_TYPE;
  } else {
    definition += column.DATA_TYPE;
  }
  
  definition += ')';
  
  // Add constraints
  const constraints = [];
  
  if (column.COLUMN_KEY === 'PRI') {
    constraints.push('PRIMARY KEY');
  }
  
  if (column.COLUMN_KEY === 'UNI') {
    constraints.push('UNIQUE');
  }
  
  if (column.IS_NULLABLE === 'NO') {
    constraints.push('NOT NULL');
  }
  
  // Add default value if present
  if (column.COLUMN_DEFAULT !== null && column.COLUMN_DEFAULT !== undefined && column.COLUMN_DEFAULT !== 'NULL') {
    // Skip auto_increment defaults
    if (!column.EXTRA || !column.EXTRA.includes('auto_increment')) {
      if (typeof column.COLUMN_DEFAULT === 'string' && !column.COLUMN_DEFAULT.match(/^[0-9]+(\.[0-9]+)?$/)) {
        constraints.push(`default '${column.COLUMN_DEFAULT}'`);
      } else {
        constraints.push(`default ${column.COLUMN_DEFAULT}`);
      }
    }
  }
  
  if (constraints.length > 0) {
    definition += ` → ${constraints.join(', ')}`;
  }
  
  return definition;
}

/**
 * Formats table structures for prompt (bullet list format matching user's prompt style)
 * @param {Object} structures - Object with hotels, services, packages structures
 * @returns {string} Formatted table structures
 */
export function formatTableStructuresForPrompt(structures) {
  let formatted = '';
  
  // Format hotels table
  if (structures.hotels && structures.hotels.length > 0) {
    formatted += '**1. Tabla: hotels**\n';
    formatted += 'Estructura:\n';
    const hotelColumns = structures.hotels.map(col => formatColumnForPrompt(col));
    formatted += hotelColumns.join('\n');
    formatted += '\n\n';
  }
  
  // Format services table
  if (structures.services && structures.services.length > 0) {
    formatted += '**2. Tabla: services**\n';
    formatted += 'Estructura:\n';
    const serviceColumns = structures.services.map(col => formatColumnForPrompt(col));
    formatted += serviceColumns.join('\n');
    formatted += '\n\n';
  }
  
  // Format packages table
  if (structures.packages && structures.packages.length > 0) {
    formatted += '**3. Tabla: packages**\n';
    formatted += 'Estructura:\n';
    const packageColumns = structures.packages.map(col => formatColumnForPrompt(col));
    formatted += packageColumns.join('\n');
    formatted += '\n';
  }
  
  return formatted;
}

/**
 * Creates AgentsClient
 * @returns {Promise<AgentsClient>} Configured client
 */
async function createClient() {
  const credential = new DefaultAzureCredential();
  const client = new AgentsClient(config.agent.projectId, credential);
  return client;
}

/**
 * Updates the agent's system prompt with new table structures
 * Replaces the table structure section in the prompt with the current database structures
 * @param {string} basePrompt - Base prompt text (with or without table structures)
 * @param {string} tableStructures - Formatted table structures
 * @param {string} placeholder - Placeholder text to replace (e.g., "{{TABLE_STRUCTURES}}")
 * @returns {Promise<boolean>} True if update was successful
 */
export async function updateAgentPrompt(basePrompt, tableStructures, placeholder = '{{TABLE_STRUCTURES}}') {
  try {
    if (!config.agent.agentId) {
      throw new Error('Agent ID no configurado');
    }

    const client = await createClient();
    
    // Get current agent
    const agent = await client.getAgent(config.agent.agentId);
    
    let updatedPrompt;
    
    // If placeholder exists, replace it
    if (basePrompt.includes(placeholder)) {
      updatedPrompt = basePrompt.replace(placeholder, tableStructures);
    } else {
      // Otherwise, try to find and replace the table structures section
      // Look for the pattern: **TABLAS DISPONIBLES EN LA BASE DE DATOS:** ... **IMPORTANTE sobre la tool SQL:**
      const startMarker = '**TABLAS DISPONIBLES EN LA BASE DE DATOS:**';
      const endMarker = '**IMPORTANTE sobre la tool SQL:**';
      
      const startIndex = basePrompt.indexOf(startMarker);
      const endIndex = basePrompt.indexOf(endMarker);
      
      if (startIndex !== -1 && endIndex !== -1) {
        // Replace the section between markers
        // Keep everything before the start marker
        const beforeSection = basePrompt.substring(0, startIndex + startMarker.length);
        // Keep everything from the end marker onwards
        const afterSection = basePrompt.substring(endIndex);
        
        // Insert new table structures section
        updatedPrompt = `${beforeSection}\n\nSolo tienes acceso a 3 tablas mediante la tool SQL:\n\n${tableStructures}${afterSection}`;
      } else {
        // If markers not found, try to find just the start marker and replace from there
        if (startIndex !== -1) {
          // Find the next section marker (look for next **)
          const nextSectionMatch = basePrompt.substring(startIndex + startMarker.length).match(/\n\*\*/);
          if (nextSectionMatch) {
            const nextSectionIndex = startIndex + startMarker.length + nextSectionMatch.index;
            const beforeSection = basePrompt.substring(0, startIndex + startMarker.length);
            const afterSection = basePrompt.substring(nextSectionIndex);
            updatedPrompt = `${beforeSection}\n\nSolo tienes acceso a 3 tablas mediante la tool SQL:\n\n${tableStructures}${afterSection}`;
          } else {
            // If no next section found, append after start marker
            const beforeSection = basePrompt.substring(0, startIndex + startMarker.length);
            const afterSection = basePrompt.substring(startIndex + startMarker.length);
            updatedPrompt = `${beforeSection}\n\nSolo tienes acceso a 3 tablas mediante la tool SQL:\n\n${tableStructures}${afterSection}`;
          }
        } else {
          // If markers not found, just append at the end
          console.warn('⚠️ No se encontraron los marcadores de sección, agregando estructuras al final');
          updatedPrompt = `${basePrompt}\n\n${tableStructures}`;
        }
      }
    }
    
    // Update agent with new instructions
    await client.updateAgent(config.agent.agentId, {
      instructions: updatedPrompt
    });

    console.log('✅ Prompt del agente actualizado exitosamente con nuevas estructuras de tablas');
    return true;
  } catch (error) {
    console.error('❌ Error actualizando prompt del agente:', error.message);
    throw error;
  }
}

/**
 * Loads base prompt from file if basePrompt is a file path, otherwise uses it as text
 * @param {string} basePrompt - Base prompt text or file path
 * @returns {string} Base prompt text
 */
function loadBasePrompt(basePrompt) {
  if (!basePrompt) {
    return '';
  }
  
  // Check if it's a file path (contains path separators or ends with .txt/.md)
  const looksLikeFilePath = basePrompt.includes('/') || basePrompt.includes('\\') || 
                             basePrompt.endsWith('.txt') || basePrompt.endsWith('.md');
  
  if (looksLikeFilePath && fs.existsSync(basePrompt)) {
    console.log(`📄 Cargando prompt base desde archivo: ${basePrompt}`);
    return fs.readFileSync(basePrompt, 'utf-8');
  }
  
  // Otherwise treat it as text
  return basePrompt;
}

/**
 * Main function to update agent prompt with current table structures
 * @param {string} basePrompt - Base prompt text (or file path) with placeholder for table structures
 * @param {string} placeholder - Placeholder text to replace (default: "{{TABLE_STRUCTURES}}")
 * @returns {Promise<boolean>} True if update was successful
 */
export async function updateAgentPromptWithTableStructures(basePrompt, placeholder = '{{TABLE_STRUCTURES}}') {
  try {
    // Load base prompt (from file or use as text)
    const promptText = loadBasePrompt(basePrompt);
    
    if (!promptText) {
      throw new Error('Base prompt no proporcionado');
    }
    
    // Get current table structures from database
    const structures = await getAllTableStructures();
    
    // Format as SQL CREATE TABLE statements
    const tableStructuresSQL = formatTableStructuresForPrompt(structures);
    
    console.log('📝 Estructuras de tablas obtenidas:');
    console.log(tableStructuresSQL);
    
    // Update agent prompt
    await updateAgentPrompt(promptText, tableStructuresSQL, placeholder);
    
    return true;
  } catch (error) {
    console.error('❌ Error en updateAgentPromptWithTableStructures:', error.message);
    throw error;
  }
}
