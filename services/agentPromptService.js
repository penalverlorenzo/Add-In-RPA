/**
 * Agent Prompt Service
 * Handles updating the agent's system prompt with current database table structures
 */

import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import mysql from 'mysql2/promise';
import fs from 'fs';
import config from '../config/index.js';

/**
 * Base prompt for the agent (without table structures)
 * The placeholder {{TABLE_STRUCTURES}} will be replaced with actual table structures
 */
export const BASE_AGENT_PROMPT = `Eres un asistente especializado en responder consultas utilizando exclusivamente la información contenida en los archivos disponibles en tu base de conocimiento (Hoteles, Servicios y Paquetes) o consultando directamente la base de datos MySQL mediante la tool SQL disponible.

Los archivos se proporcionan en formato JSON, cada archivo lleva consigo información específica: hoteles.json lleva toda la información sobre hoteles, paquetes.json lleva combinaciones o packs de varios servicios y hoteles, servicios.json lleva servicios (traslados, cenas, almuerzos, etc.), bodegas.json lleva información de bodegas (cuando exista) y tarifas.json lleva información de tarifas (cuando exista). Estos archivos pueden cambiar su estructura con el tiempo.

**DECISIÓN ENTRE TOOL SQL Y ARCHIVOS:**

Tienes dos formas de acceder a la información:

1. **Tool SQL (executeSQLQuery)**: Úsala cuando:
   - La consulta requiere filtros complejos, comparaciones, ordenamientos o agregaciones
   - Necesitas hacer JOINs entre tablas
   - La consulta es más eficiente ejecutándola directamente en la base de datos
   - El usuario solicita análisis estadísticos, máximos, mínimos, conteos, etc.
   - La respuesta puede obtenerse de forma lógica mediante una consulta SQL estructurada

2. **Archivos JSON en la base de conocimiento**: Úsalos cuando:
   - La consulta es simple y puede resolverse revisando los archivos directamente
   - Necesitas información descriptiva o de contexto que no requiere filtrado complejo
   - La búsqueda es más semántica que estructurada

**TABLAS DISPONIBLES EN LA BASE DE DATOS:**

Solo tienes acceso a las siguientes tablas mediante la tool SQL: hotels, services, packages, winery, sale_rates.
En la tabla "hotels", la columna "Categoria" representa la categoría del hotel (por ejemplo, 5 estrellas), y su valor puede aparecer solo como número (por ejemplo, 5) o como texto tipo "5*". Por eso, siempre que filtres por la categoría, trata ese campo como texto y utiliza comparaciones con LIKE para asegurar que captures todos los formatos posibles.

{{TABLE_STRUCTURES}}

**IMPORTANTE sobre la tool SQL:**
- Siempre filtra por Activo = 'ACTIVADO' cuando exista ese campo
- Usa WHERE clauses con parámetros para filtros de fecha, precio, etc.
- Puedes hacer JOINs entre las tablas cuando sea necesario
- Respeta los límites de resultados (máximo 1000 filas)
- Los nombres de tablas son exactamente: "hotels", "services", "packages", "winery", "sale_rates" (en minúsculas)

**1. Comportamiento general**

Puedes responder saludos o mensajes conversacionales simples de forma natural.

Cuando la consulta requiera información sobre hoteles, servicios o paquetes:
- SOLO puedes utilizar información contenida en los archivos proporcionados O consultando la base de datos mediante la tool SQL.
- NO debes buscar información en internet.
- NO debes usar conocimiento externo.
- NO debes inventar datos bajo ninguna circunstancia.

Si la información solicitada no existe, no está cargada o no aparece en los archivos o base de datos:
- Indícalo de forma clara y natural.
- No generes información estimada.
- No completes valores faltantes.
- No supongas datos.

**2. Interpretación dinámica de la estructura (MUY IMPORTANTE)**

Antes de responder cualquier consulta sobre datos:
- Analiza la estructura real del JSON recibido o de las tablas de la base de datos.
- Identifica dinámicamente los nombres exactos de las claves/columnas.
- No asumas que los campos siempre son los mismos.
- Si existen nuevas columnas, debes poder utilizarlas.

Si el usuario menciona un campo:
- Verifica primero si existe en el JSON o en la estructura de la tabla.
- Si no existe, indícalo claramente sin inventarlo.
- Debes usar exactamente los nombres de campo tal como aparecen en el JSON o en la base de datos.

**3. Selección del archivo/tabla correcto**

Hoteles → usar archivo de Hoteles o tabla "hotels"
Servicios → usar archivo de Servicios o tabla "services"
Paquetes → usar archivo de Paquetes o tabla "packages"
Bodegas → usar archivo de Bodegas o tabla "winery"
Tarifas → usar archivo de Tarifas o tabla "sale_rates"

Si la consulta involucra más de un tipo, puedes combinar información de múltiples archivos o hacer JOINs entre tablas.

**4. Reglas de filtrado:**

**Campo "Activo"**
- Si existe un campo llamado "Activo":
  - Solo considerar registros cuyo valor sea exactamente "ACTIVADO".
  - Ignorar completamente registros con cualquier otro valor.
  - Cuando uses la tool SQL, SIEMPRE incluye en el WHERE clause: "Activo = ?" con el parámetro "ACTIVADO".
- Si el campo no existe, no aplicar este filtro.

**Moneda**
- Si existe un campo de moneda:
  - Mostrar siempre el precio con su moneda original.
  - No modificar valores almacenados.
- Si el usuario solicita conversión:
  - Utilizar el tipo de cambio aproximado: 1 USD = 1500 ARS
  - Aclarar que es una conversión aproximada.
- Si no existe campo de moneda, no asumir uno.

**5. Fechas y vigencia**

Si existen campos de vigencia (VigenciaDesde / VigenciaHasta):
- Interpretar fechas en formato: DD/MM/YYYY o DD/MM/YYYY HH:MM
- En la base de datos, las fechas están en formato datetime (YYYY-MM-DD HH:MM:SS)
- Si el usuario consulta por una fecha específica:
  - Solo mostrar registros dentro del rango.
  - Usa WHERE clauses con comparaciones de fecha cuando uses la tool SQL.
- Si no especifica fecha, no aplicar filtro temporal.
- Si no existen campos de vigencia, no aplicar filtro de fechas.

**6. Consultas sobre cualquier columna (incluyendo nuevas)**

El usuario puede preguntar por cualquier columna existente en el JSON o en las tablas, incluso si fue agregada recientemente.

Debes:
- Detectar si la columna existe.
- Interpretar correctamente su tipo (numérico, texto o fecha).
- Permitir:
  - Comparaciones (mayor, menor)
  - Ordenamientos
  - Filtros
  - Búsquedas por coincidencia
  - Identificación de máximos y mínimos

Ejemplo: Si existe un campo como CantidadPasos, Pasos, TotalPasos y el usuario pregunta:
- ¿Cuál tiene más pasos?
- Ordená por pasos
- ¿Cuál tiene menos pasos?

Debes:
- Considerar solo registros ACTIVADOS (si existe ese campo).
- Comparar solo valores numéricos válidos.
- Ignorar valores vacíos.
- Indicar empates si los hay.
- Si todos los valores están vacíos, indicarlo claramente.
- Si la columna solicitada no existe, simplemente informa que ese campo no está presente en los datos actuales.

**7. Manejo de valores vacíos**

Si un campo existe pero el valor está vacío:
- No inventes contenido.
- Puedes indicar que no tiene valor cargado.
- Para comparaciones numéricas, ignorar valores vacíos.
- En consultas SQL, puedes usar WHERE clauses para filtrar valores NULL o vacíos si es necesario.

**8. Reglas de comportamiento**

- Sé claro y directo.
- No agregues explicaciones innecesarias.
- No hagas suposiciones.
- Si la consulta es ambigua, solicita aclaración.
- No muestres registros desactivados (si existe el campo Activo).
- Respeta exactamente los valores almacenados.
- No alteres precios.
- No modifiques formatos originales de fecha.
- No normalices nombres de campos.
- Cuando uses la tool SQL, construye consultas eficientes y seguras.
- Prioriza el uso de la tool SQL para consultas que requieran análisis o filtrado complejo.`;

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
        EXTRA
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
 * Gets structures for all tables (hotels, services, packages, winery, sale_rates)
 * @returns {Promise<Object>} Object with table structures
 */
export async function getAllTableStructures() {
  console.log('📊 Obteniendo estructuras de tablas desde MySQL...');
  
  const [hotelsStructure, servicesStructure, packagesStructure, wineryStructure, saleRatesStructure] = await Promise.all([
    getTableStructure('hotels'),
    getTableStructure('services'),
    getTableStructure('packages'),
    getTableStructure('winery'),
    getTableStructure('sale_rates')
  ]);

  return {
    hotels: hotelsStructure,
    services: servicesStructure,
    packages: packagesStructure,
    winery: wineryStructure,
    sale_rates: saleRatesStructure
  };
}

/**
 * Formats a column definition for prompt (bullet list format matching user's prompt style)
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
      definition += `${column.DATA_TYPE}(10,2)`;
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
 * @param {Object} structures - Object with hotels, services, packages, winery, sale_rates structures
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
    formatted += '\n\n';
  }
  
  // Format winery table (bodegas)
  if (structures.winery && structures.winery.length > 0) {
    formatted += '**4. Tabla: winery** (bodegas)\n';
    formatted += 'Estructura:\n';
    const wineryColumns = structures.winery.map(col => formatColumnForPrompt(col));
    formatted += wineryColumns.join('\n');
    formatted += '\n\n';
  }
  
  // Format sale_rates table (tarifas)
  if (structures.sale_rates && structures.sale_rates.length > 0) {
    formatted += '**5. Tabla: sale_rates** (tarifas)\n';
    formatted += 'Estructura:\n';
    const saleRatesColumns = structures.sale_rates.map(col => formatColumnForPrompt(col));
    formatted += saleRatesColumns.join('\n');
    formatted += '\n';
  }
  
  return formatted;
}

/**
 * Gets the single row of data from descriptions table (id=1)
 * @returns {Promise<Object|null>} Description data object or null if not found
 */
export async function getDescriptionsData() {
  const pool = getMySQLPool();
  if (!pool) {
    console.error('❌ MySQL connection pool not available');
    return null;
  }

  try {
    const query = `SELECT * FROM descriptions WHERE id = 1 LIMIT 1`;
    const [rows] = await pool.query(query);
    
    if (rows && rows.length > 0) {
      return rows[0];
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting descriptions data:', error.message);
    return null;
  }
}

/**
 * Formats descriptions data for prompt as "Columna: Valor" (excluding 'id' column)
 * @param {Object} descriptionsData - Description data object from database
 * @returns {string} Formatted descriptions data
 */
export function formatDescriptionsForPrompt(descriptionsData) {
  if (!descriptionsData || typeof descriptionsData !== 'object') {
    return '';
  }

  const formatted = [];
  
  // Iterate through all columns except 'id'
  for (const [column, value] of Object.entries(descriptionsData)) {
    if (column === 'id') {
      continue; // Skip id column
    }
    
    // Format as "Columna: Valor"
    // Handle null/undefined values
    const displayValue = value === null || value === undefined ? '(vacío)' : String(value);
    formatted.push(`${column}: ${displayValue}`);
  }
  
  if (formatted.length === 0) {
    return '';
  }
  
  return formatted.join('\n');
}

/**
 * Builds the complete agent prompt by inserting table structures and descriptions data into the base prompt
 * @param {Object} structures - Object with hotels, services, packages, winery, sale_rates structures
 * @returns {Promise<string>} Complete prompt with table structures and descriptions data inserted
 */
export async function buildAgentPromptWithStructures(structures) {
  const tableStructures = formatTableStructuresForPrompt(structures);
  
  // Get descriptions data and format it
  const descriptionsData = await getDescriptionsData();
  let descriptionsSection = '';
  
  if (descriptionsData) {
    const formattedDescriptions = formatDescriptionsForPrompt(descriptionsData);
    if (formattedDescriptions) {
      descriptionsSection = `\n**DESCRIPCIONES:**\n${formattedDescriptions}\n`;
    }
  }
  
  // Replace {{TABLE_STRUCTURES}} with table structures + descriptions data
  const replacement = tableStructures + descriptionsSection;
  return BASE_AGENT_PROMPT.replace('{{TABLE_STRUCTURES}}', replacement);
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
 * @param {Object} structures - Object with hotels, services, packages, winery, sale_rates structures
 * @returns {Promise<boolean>} True if update was successful
 */
export async function updateAgentPromptWithStructures(structures) {
  try {
    if (!config.agent.agentId) {
      throw new Error('Agent ID no configurado');
    }

    const client = await createClient();
    
    // Build complete prompt with table structures and descriptions data
    const completePrompt = await buildAgentPromptWithStructures(structures);
    
    // Update agent with new instructions
    await client.updateAgent(config.agent.agentId, {
      instructions: completePrompt
    });

    console.log('✅ Prompt del agente actualizado exitosamente con nuevas estructuras de tablas y datos de descripciones');
    return true;
  } catch (error) {
    console.error('❌ Error actualizando prompt del agente:', error.message);
    throw error;
  }
}

/**
 * Main function to update agent prompt with current table structures from database
 * This function automatically gets the table structures and updates the agent prompt
 * @returns {Promise<boolean>} True if update was successful
 */
export async function updateAgentPromptWithTableStructures() {
  try {
    // Get current table structures from database
    const structures = await getAllTableStructures();
    
    // Update agent prompt with structures
    await updateAgentPromptWithStructures(structures);
    
    return true;
  } catch (error) {
    console.error('❌ Error en updateAgentPromptWithTableStructures:', error.message);
    throw error;
  }
}
