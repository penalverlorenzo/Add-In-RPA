/**
 * Agent File Service (AgentsClient) - Manages files in Azure AI Agents Vector Store
 * Handles uploading and updating files for agents using AgentsClient
 */

import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import config from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { saveAllDataToDB } from './agentDataService.js';
import { updateAgentPromptWithTableStructures } from './agentPromptService.js';

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
 * Validates the configuration for the agent
 * @throws {Error} If configuration is missing
 */
function validateConfiguration() {
  if (!config.agent.agentId || !config.agent.vectorStoreId) {
    throw new Error('Agent ID o Vector Store ID no configurados. Verifica las variables de entorno AZURE_OPENAI_AGENT_ID y AZURE_OPENAI_AGENT_VECTOR_STORE_ID');
  }

  if (!config.agent.projectId) {
    throw new Error('Azure AI Agents Project ID no configurado');
  }
}

/**
 * Validates the request body
 * @param {Object} body - Request body with Hoteles, Servicios, Paquetes, Bodegas (optional), Tarifas (optional), Descripciones (optional)
 * @throws {Error} If validation fails
 */
function validateBody(body) {
  const { Hoteles, Servicios, Paquetes, Bodegas, Tarifas, Descripciones } = body;

  if (!Hoteles || !Array.isArray(Hoteles)) {
    throw new Error('El campo "Hoteles" es requerido y debe ser un array');
  }

  if (!Servicios || !Array.isArray(Servicios)) {
    throw new Error('El campo "Servicios" es requerido y debe ser un array');
  }

  if (!Paquetes || !Array.isArray(Paquetes)) {
    throw new Error('El campo "Paquetes" es requerido y debe ser un array');
  }

  // Bodegas is optional
  if (Bodegas !== undefined && !Array.isArray(Bodegas)) {
    throw new Error('El campo "Bodegas" debe ser un array si se proporciona');
  }

  // DISABLED: Tarifas - re-enable when in use
  // if (Tarifas !== undefined && !Array.isArray(Tarifas)) {
  //   throw new Error('El campo "Tarifas" debe ser un array si se proporciona');
  // }

  // Descripciones is optional
  if (Descripciones !== undefined && !Array.isArray(Descripciones)) {
    throw new Error('El campo "Descripciones" debe ser un array si se proporciona');
  }
}

/**
 * Lists and deletes all existing files from Azure AI Agents
 * Deletes files directly from Azure AI Agents storage, which automatically removes them from the vector store
 * @param {AgentsClient} client - AgentsClient
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<number>} Number of deleted files
 */
async function deleteExistingFiles(client, vectorStoreId) {
  console.log('🔍 Listando archivos existentes en el vector store...');
  
  let filesToDelete = [];
  try {
    // List files in the vector store
    const filesIterator = client.vectorStoreFiles.list(vectorStoreId);
    for await (const file of filesIterator) {
      filesToDelete.push(file);
    }
  } catch (error) {
    console.warn('⚠️ Error listando archivos del vector store:', error.message);
    // If vector store doesn't exist or has no files, continue
  }
  
  console.log(`📋 Encontrados ${filesToDelete.length} archivos existentes`);

  if (filesToDelete.length > 0) {
    console.log('🗑️ Eliminando archivos existentes de Azure AI Agents...');
    const deletePromises = filesToDelete.map(async (file) => {
      try {
        const fileId = file.id || file.file_id;
        
        // Delete file directly from Azure AI Agents storage
        // This will automatically remove it from the vector store and free up storage space
        await client.files.delete(fileId);
        await client.vectorStoreFiles.delete(vectorStoreId, fileId);
        console.log(`   ✅ Archivo eliminado de Azure AI Agents: ${fileId}`);
      } catch (error) {
        console.error(`   ❌ Error al eliminar archivo ${file.id || file.file_id}:`, error.message);
        // Continuar aunque falle la eliminación de un archivo
      }
    });
    
    await Promise.all(deletePromises);
    console.log('✅ Archivos existentes eliminados de Azure AI Agents');
  } else {
    console.log('ℹ️ No hay archivos existentes para eliminar');
  }

  return filesToDelete.length;
}

/**
 * Uploads a single file to the vector store
 * @param {AgentsClient} client - AgentsClient
 * @param {string} vectorStoreId - Vector store ID
 * @param {Object} fileData - File data with name, content, and data
 * @returns {Promise<Object>} Uploaded file information
 */
async function uploadFile(client, vectorStoreId, fileData) {
  let tempFilePath = null;
  try {
    // Create temporary file
    tempFilePath = path.join(tmpdir(), `${Date.now()}-${fileData.name}`);
    fs.writeFileSync(tempFilePath, fileData.content, 'utf-8');
    
    // Create stream from temporary file
    const fileStream = fs.createReadStream(tempFilePath);

    // Upload file using AgentsClient
    console.log(`   📤 Subiendo ${fileData.name}...`);
    const uploadedFile = await client.files.upload(fileStream, 'assistants', {
      fileName: fileData.name
    });

    console.log(`   ✅ Archivo subido: ${uploadedFile.id} (${fileData.name})`);

    // Associate file to vector store
    await client.vectorStoreFiles.create(vectorStoreId, {
      fileId: uploadedFile.id
    });

    console.log(`   ✅ Archivo asociado al vector store: ${uploadedFile.id}`);
    
    return {
      fileName: fileData.name,
      fileId: uploadedFile.id,
      itemCount: fileData.data.length
    };
  } catch (error) {
    console.error(`   ❌ Error al subir ${fileData.name}:`, error.message);
    throw new Error(`Error al subir ${fileData.name}: ${error.message}`);
  } finally {
    // Clean up temporary file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn(`   ⚠️ No se pudo eliminar archivo temporal ${tempFilePath}:`, cleanupError.message);
      }
    }
  }
}

/**
 * Updates agent files in the vector store using AgentsClient
 * @param {Object} body - Request body with Hoteles, Servicios, Paquetes arrays, Bodegas (optional), Tarifas (optional), Descripciones (optional)
 * @returns {Promise<Object>} Result with deleted files count, uploaded files info, and summary
 */
export async function updateAgentFilesAgents(body) {
  // Validate configuration
  validateConfiguration();

  // Validate body
  validateBody(body);

  const { Hoteles, Servicios, Paquetes, Bodegas, Descripciones } = body;
  const bodegasInfo = Bodegas && Bodegas.length > 0 ? `, ${Bodegas.length} bodegas` : '';
  const descripcionesInfo = Descripciones && Descripciones.length > 0 ? `, ${Descripciones.length} descripciones` : '';
  console.log(`📊 Datos recibidos: ${Hoteles.length} hoteles, ${Servicios.length} servicios, ${Paquetes.length} paquetes${bodegasInfo}${descripcionesInfo}`);

  // Create AgentsClient
  const client = await createClient();
  const vectorStoreId = config.agent.vectorStoreId;

  // 1. Delete existing files
  const deletedFilesCount = await deleteExistingFiles(client, vectorStoreId);

  // 2. Create JSON files in memory
  console.log('📝 Creando archivos JSON...');
  const filesToUpload = [
    {
      name: 'hoteles.json',
      content: JSON.stringify(Hoteles, null, 2),
      data: Hoteles
    },
    {
      name: 'servicios.json',
      content: JSON.stringify(Servicios, null, 2),
      data: Servicios
    },
    {
      name: 'paquetes.json',
      content: JSON.stringify(Paquetes, null, 2),
      data: Paquetes
    }
  ];
  if (Bodegas && Bodegas.length > 0) {
    filesToUpload.push({
      name: 'bodegas.json',
      content: JSON.stringify(Bodegas, null, 2),
      data: Bodegas
    });
  }
  // DISABLED: Tarifas - re-enable when in use (do not send tarifas.json to IA)
  // if (Tarifas && Tarifas.length > 0) {
  //   filesToUpload.push({
  //     name: 'tarifas.json',
  //     content: JSON.stringify(Tarifas, null, 2),
  //     data: Tarifas
  //   });
  // }

  // 3. Upload files to vector store
  console.log('📤 Subiendo archivos al vector store...');
  const uploadedFiles = [];

  for (const fileData of filesToUpload) {
    const uploadedFileInfo = await uploadFile(client, vectorStoreId, fileData);
    uploadedFiles.push(uploadedFileInfo);
  }

  console.log('✅ Todos los archivos han sido subidos exitosamente');

  // 4. Save data to MySQL database
  let dbResults = null;
  try {
    console.log('💾 Guardando datos en base de datos MySQL...');
    dbResults = await saveAllDataToDB(Hoteles, Servicios, Paquetes, Bodegas, undefined, Descripciones); // Tarifas disabled
    console.log('✅ Datos guardados en base de datos MySQL');
  } catch (error) {
    console.error('❌ Error guardando datos en base de datos:', error.message);
    // Don't fail the entire operation if DB save fails
    dbResults = {
      error: error.message,
      hotels: { inserted: 0, updated: 0, errors: Hoteles.length, total: Hoteles.length },
      services: { inserted: 0, updated: 0, errors: Servicios.length, total: Servicios.length },
      packages: { inserted: 0, updated: 0, errors: Paquetes.length, total: Paquetes.length },
      wineries: { inserted: 0, updated: 0, errors: Bodegas?.length || 0, total: Bodegas?.length || 0 },
      saleRates: { inserted: 0, updated: 0, errors: 0, total: 0 }, // tarifas disabled
      descriptions: { inserted: 0, updated: 0, errors: Descripciones?.length || 0, total: Descripciones?.length || 0 }
    };
  }

  // 5. Update agent prompt with new table structures (always, after DB save)
  let promptUpdated = false;
  try {
    console.log('📝 Actualizando prompt del agente con nuevas estructuras de tablas...');
    await updateAgentPromptWithTableStructures();
    promptUpdated = true;
    console.log('✅ Prompt del agente actualizado exitosamente');
  } catch (error) {
    console.error('❌ Error actualizando prompt del agente:', error.message);
    // Don't fail the entire operation if prompt update fails
  }

  return {
    deletedFiles: deletedFilesCount,
    uploadedFiles: uploadedFiles,
    summary: {
      hoteles: Hoteles.length,
      servicios: Servicios.length,
      paquetes: Paquetes.length,
      bodegas: Bodegas?.length ?? 0
    },
    database: dbResults,
    promptUpdated: promptUpdated
  };
}
