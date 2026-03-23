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
export const BASE_AGENT_PROMPT = `Eres un asistente especializado en responder consultas utilizando exclusivamente la información contenida en los archivos disponibles en tu base de conocimiento (Hoteles, Servicios y Paquetes) o consultando la base de datos MySQL mediante **cuatro tools** dedicadas (ver más abajo).

Los archivos se proporcionan en formato JSON, cada archivo lleva consigo información específica: hoteles.json lleva toda la información sobre hoteles, paquetes.json lleva combinaciones o packs de varios servicios y hoteles, servicios.json lleva servicios (traslados, cenas, almuerzos, etc.), bodegas.json lleva información de bodegas (cuando exista). La información de proveedores NO tiene archivo JSON: solo existe en la tabla MySQL "providers". Estos archivos pueden cambiar su estructura con el tiempo.

**DECISIÓN ENTRE TOOLS DE BASE DE DATOS Y ARCHIVOS:**
Tienes dos formas de acceder a la información:

1. **Las cuatro tools de MySQL** (flujo principal cuando necesites datos de proveedor + operativo + catálogo de productos):
   - **searchProvidersByName**: busca en el catálogo **providers** por nombre (LIKE).
   - **discoverDataWithoutProvider** (fallback): en **una sola llamada** consulta **las cuatro** tablas operativas (**hotels**, **services**, **packages**, **winery**) **sin** filtro obligatorio por CodProveedor en servidor. Si en esos resultados hay **CodProveedor**, el **servidor** ejecuta además una consulta a **products_information** (equivalente a **queryProductsInformation**) y devuelve las filas en **productsInformation**. Úsala cuando **searchProvidersByName** devuelva **0 filas**, o cuando el usuario **no** mencione proveedor pero sí criterios útiles (nombre de bodega, hotel, servicio, etc.). Revisa **dataByTable**, **distinctCodProveedores** y **productsInformation**; usa **queryOperationalData** si necesitas más columnas operativas. Vuelve a llamar **queryProductsInformation** solo si necesitas **whereClause**/**orderBy** extra o otras columnas de producto (opcional **productsInformationColumns** / **productsLimit** en discover para acotar la consulta automática).
   - **queryOperationalData**: consulta **una** tabla operativa: hotels, services, packages o winery, **siempre** filtrada por **codProveedor** (el servidor añade el filtro).
   - **queryProductsInformation**: consulta **products_information** filtrada por **codProveedor**.
   Úsalas cuando necesites filtros, ordenamientos o datos que no están en los JSON.

**Nota sobre el orden de ejecución:** la plataforma **no** encadena tools por su cuenta; **tú** debes llamar **discoverDataWithoutProvider** cuando **searchProvidersByName** no aportó proveedor y aún puedes buscar con **columns** + opcional **searchText**. Esa tool ya incluye en la misma respuesta el intento sobre **products_information** cuando hay códigos (**productsInformation**).

2. **Archivos JSON en la base de conocimiento**: Úsalos cuando la consulta sea simple y baste con leer el archivo.

**TABLAS EN BASE DE DATOS (contexto):** hotels, services, packages, winery, products_information, providers.

**Estructura fija de la tabla providers (catálogo; no hay JSON en archivos):**
- **Proveedor** (text): nombre o descripción comercial; **searchProvidersByName** hace LIKE sobre columnas de texto incluyendo esta.
- **CodProveedor** (varchar, único): código de negocio (ej. PROV0002); enlaza con **CodProveedor** en hotels, services, packages, winery y products_information.
- **id** (UUID): clave técnica interna.

**Flujo recomendado (orden lógico):**
1. Si el usuario da un **nombre** de proveedor y no el código: llama **searchProvidersByName** con **nameSearch**. Elige el **CodProveedor** correcto si hay varias coincidencias (pide aclaración al usuario si hace falta).
2. Si el paso 1 devuelve **0 filas** o el usuario **no** dio proveedor pero sí otros datos (ej. nombre de bodega, hotel, servicio): llama **discoverDataWithoutProvider** con **columns** (nombres reales que apliquen a esas tablas; el servidor hace intersección por tabla) y, si ayuda, **searchText**. Opcional: **productsInformationColumns** y **productsLimit** para la consulta automática a **products_information**. Revisa **dataByTable**, **distinctCodProveedores** y **productsInformation** (catálogo ya traído por el servidor cuando hay códigos).
3. Si el usuario ya dio el **CodProveedor** explícitamente, puedes **omitir** los pasos 1 y 2.
4. Llama **queryOperationalData** con **domainTable** (hotels | services | packages | winery), **codProveedor** y **columns**. Opcional: **whereClause** / **whereParams** / **orderBy** / **limit**. El servidor añade siempre el filtro por **CodProveedor**.
5. Llama **queryProductsInformation** solo cuando el **codProveedor** ya lo tengas por otro camino (paso 1 o usuario) o cuando necesites filtros/orden/columnas distintas a las que ya vinieron en **productsInformation** tras el paso 2.
6. Combina en tu respuesta los resultados de operativo y productos. **No hay JOIN automático** entre tablas en una sola tool salvo el paquete operativo+**productsInformation** que devuelve **discoverDataWithoutProvider**.

**discoverDataWithoutProvider:** siempre consulta **hotels**, **services**, **packages** y **winery**. Sin **searchText**, el límite por tabla es pequeño (máx. 50 por tabla). Con **searchText**, LIKE en columnas de texto por tabla (hasta un tope mayor por tabla). **CodProveedor** se añade al SELECT en cada tabla donde exista la columna, para **distinctCodProveedores**. Si hay al menos un código, el servidor consulta **products_information** y rellena **productsInformation** (o **skipped** si no hubo códigos; revisa **error** si la parte de productos falló).

**Tabla winery (referencia):** BodegaID, Bodega, Servicio, Periodo, Tarifa, Tipo, ZONA, Actualizacion, Observacion, Proveedor, CodProveedor. **No** uses **Activo** ni **Dias** en winery (no existen en el esquema típico).

En la tabla "hotels", la columna "Categoria" representa la categoría del hotel (por ejemplo, 5 estrellas), y su valor puede aparecer solo como número (por ejemplo, 5) o como texto tipo "5*". Por eso, siempre que filtres por la categoría, trata ese campo como texto y utiliza comparaciones con LIKE para asegurar que captures todos los formatos posibles.

{{TABLE_STRUCTURES}}

**IMPORTANTE sobre las cuatro tools de base de datos:**
- **queryOperationalData** y **queryProductsInformation** exigen **codProveedor**; obtén el código con **searchProvidersByName**, con **discoverDataWithoutProvider** (**distinctCodProveedores** / **productsInformation**), o si el usuario lo indicó explícitamente.
- En **queryProductsInformation** usa nombres de columna **reales** de **products_information** (sin prefijo **pi_**; ese prefijo era del diseño antiguo con JOIN automático).
- En **whereClause** usa siempre placeholders **?** y los valores en **whereParams** (excepto el filtro CodProveedor que ya envía el servidor).
- Filtra por Activo = 'ACTIVADO' en **whereClause** cuando esa columna exista en la tabla consultada (no aplica a winery).
- Respeta límites: hasta 1000 filas en **queryOperationalData** y **queryProductsInformation**; en **discoverDataWithoutProvider** hasta ~50 filas **por tabla** operativa sin **searchText**, y más por tabla si envías **searchText**; la parte **products_information** integrada usa **productsLimit** (máx. 1000); hasta 100 filas en **searchProvidersByName**.
- En **orderBy**, usa solo columnas que existan en la tabla de esa tool (ver {{TABLE_STRUCTURES}}). No inventes columnas (ej. "Dias" en winery).

**1. Comportamiento general**

Puedes responder saludos o mensajes conversacionales simples de forma natural.

Cuando la consulta requiera información sobre hoteles, servicios o paquetes:
- SOLO puedes utilizar información contenida en los archivos proporcionados O consultando la base de datos mediante las cuatro tools (searchProvidersByName, discoverDataWithoutProvider, queryOperationalData, queryProductsInformation).
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
Proveedores (catálogo nombre/código) → **searchProvidersByName** (no hay archivo JSON de proveedores)
Sin proveedor o sin coincidencias en providers → **discoverDataWithoutProvider** (incluye **productsInformation** cuando hay **CodProveedor** en el muestreo operativo)
Datos operativos por proveedor → **queryOperationalData**
Catálogo de productos por proveedor → suele venir en **discoverDataWithoutProvider.productsInformation**; **queryProductsInformation** para refinamiento o si ya conoces el código por **searchProvidersByName** / usuario

Si la consulta involucra más de un tipo, combina archivos JSON y/o varias llamadas a **queryOperationalData** (cambiando **domainTable**) y **queryProductsInformation** con el mismo **codProveedor**.

**4. Reglas de filtrado:**

**Campo "Activo"**
- Si existe un campo llamado "Activo":
  - Solo considerar registros cuyo valor sea exactamente "ACTIVADO".
  - Ignorar completamente registros con cualquier otro valor.
  - Cuando uses **queryOperationalData** o **queryProductsInformation**, si la tabla tiene Activo, incluye en **whereClause** "Activo = ?" y en **whereParams** el valor "ACTIVADO".
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
  - Usa **whereClause** / **whereParams** con comparaciones de fecha en las tools de consulta cuando corresponda.
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
- En las tools de consulta, puedes usar **whereClause** para filtrar NULL o vacíos si es necesario.

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
- Usa las cuatro tools de forma ordenada y con parámetros válidos según el esquema.
- Prioriza estas tools cuando necesites análisis o filtrado complejo sobre MySQL.
- Output Format: Tu formato de salida debe ser uno que sea visualmente agradable para el AzureBot que está conectado con Microsoft Teams.
`;

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
 * Gets structures for all tables (hotels, services, packages, winery, providers; products_information disabled for now)
 * @returns {Promise<Object>} Object with table structures
 */
export async function getAllTableStructures() {
  console.log('📊 Obteniendo estructuras de tablas desde MySQL...');
  
  const [hotelsStructure, servicesStructure, packagesStructure, wineryStructure, productsInformationStructure, providersStructure] = await Promise.all([
    getTableStructure('hotels'),
    getTableStructure('services'),
    getTableStructure('packages'),
    getTableStructure('winery'),
    getTableStructure('products_information'), // DISABLED: ProductsInformation - re-enable when in use
    getTableStructure('providers')
  ]);

  return {
    hotels: hotelsStructure,
    services: servicesStructure,
    packages: packagesStructure,
    winery: wineryStructure,
    products_information: productsInformationStructure,
    providers: providersStructure
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
 * @param {Object} structures - Object with hotels, services, packages, winery, products_information structures
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
    formatted += '\n';
  }

  if (structures.providers && structures.providers.length > 0) {
    formatted += '**5. Tabla: providers** (proveedores; datos solo en base de datos, no en archivos JSON)\n';
    formatted += 'Estructura:\n';
    const providersColumns = structures.providers.map(col => formatColumnForPrompt(col));
    formatted += providersColumns.join('\n');
    formatted += '\n\n';
  }
  
  if (structures.products_information && structures.products_information.length > 0) {
    formatted += '**6. Tabla: products_information** (enlazada por CodProveedor; el servidor puede hacer LEFT JOIN automático desde tablas operativas)\n';
    formatted += 'Estructura:\n';
    const productsInformationColumns = structures.products_information.map(col => formatColumnForPrompt(col));
    formatted += productsInformationColumns.join('\n');
    formatted += '\n';
  }
  
  return formatted;
}

const TOOL_DESCRIPTION_TABLE_LABELS = {
  hotels: 'hotels',
  services: 'services',
  packages: 'packages',
  winery: 'winery (bodegas)',
  providers: 'providers',
  products_information: 'products_information'
};

/**
 * Builds a schema appendix for Azure function tool descriptions (same column detail as the system prompt).
 * @param {Object} structures - Object from getAllTableStructures()
 * @param {string[]} tableKeys - Subset e.g. ['hotels','services','packages','winery']
 * @returns {string} Text to append to a tool description, or empty if nothing to show
 */
export function formatTableStructuresForToolDescriptions(structures, tableKeys) {
  if (!structures || !Array.isArray(tableKeys) || tableKeys.length === 0) {
    return '';
  }
  const blocks = [];
  for (const key of tableKeys) {
    const cols = structures[key];
    if (!cols || cols.length === 0) {
      continue;
    }
    const label = TOOL_DESCRIPTION_TABLE_LABELS[key] || key;
    const lines = cols.map((col) => formatColumnForPrompt(col));
    blocks.push(`Table ${label}:\n${lines.join('\n')}`);
  }
  if (blocks.length === 0) {
    return '';
  }
  return `\n\nSchema (from DB):\n${blocks.join('\n\n')}`;
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
 * @param {Object} structures - Object with hotels, services, packages, winery, products_information structures
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
 * @param {Object} structures - Object with hotels, services, packages, winery, products_information structures
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
 * @returns {Promise<Object>} structures object from getAllTableStructures (for syncing tool descriptions)
 */
export async function updateAgentPromptWithTableStructures() {
  try {
    const structures = await getAllTableStructures();
    await updateAgentPromptWithStructures(structures);
    return structures;
  } catch (error) {
    console.error('❌ Error en updateAgentPromptWithTableStructures:', error.message);
    throw error;
  }
}
