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
 * @param {Object} body - Request body with Hoteles, Servicios, Paquetes, Bodegas (optional), Proveedores (optional, DB only), ProductsInformation (optional), Descripciones (optional)
 * @throws {Error} If validation fails
 */
function validateBody(body) {
  const { Hoteles, Servicios, Paquetes, Bodegas, Proveedores, ProductsInformation, Descripciones } = body;

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

  if (Proveedores !== undefined && !Array.isArray(Proveedores)) {
    throw new Error('El campo "Proveedores" debe ser un array si se proporciona');
  }

  // DISABLED: ProductsInformation - re-enable when in use
   if (ProductsInformation !== undefined && !Array.isArray(ProductsInformation)) {
     throw new Error('El campo "ProductsInformation" debe ser un array si se proporciona');
   }

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
  
  let filesToDelete = [];
  try {
    // List files in the vector store
    const filesIterator = client.vectorStoreFiles.list(vectorStoreId);
    for await (const file of filesIterator) {
      filesToDelete.push(file);
    }
  } catch (error) {
    // If vector store doesn't exist or has no files, continue
  }
  

  if (filesToDelete.length > 0) {
    const deletePromises = filesToDelete.map(async (file) => {
      try {
        const fileId = file.id || file.file_id;
        
        // Delete file directly from Azure AI Agents storage
        // This will automatically remove it from the vector store and free up storage space
        await client.files.delete(fileId);
        await client.vectorStoreFiles.delete(vectorStoreId, fileId);
      } catch (error) {
        // Continuar aunque falle la eliminación de un archivo
      }
    });
    
    await Promise.all(deletePromises);
  } else {
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
    const uploadedFile = await client.files.upload(fileStream, 'assistants', {
      fileName: fileData.name
    });


    // Associate file to vector store
    await client.vectorStoreFiles.create(vectorStoreId, {
      fileId: uploadedFile.id
    });

    
    return {
      fileName: fileData.name,
      fileId: uploadedFile.id,
      itemCount: fileData.data.length
    };
  } catch (error) {
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
 * @param {Object} body - Request body with Hoteles, Servicios, Paquetes arrays, Bodegas (optional), Proveedores (optional, DB only), ProductsInformation (optional), Descripciones (optional)
 * @returns {Promise<Object>} Result with deleted files count, uploaded files info, and summary
 */
export async function updateAgentFilesAgents(body) {
  // Validate configuration
  validateConfiguration();

  // Validate body
  validateBody(body);

  const { Hoteles, Servicios, Paquetes, Bodegas, Proveedores, ProductsInformation, Descripciones } = body;
  const bodegasInfo = Bodegas && Bodegas.length > 0 ? `, ${Bodegas.length} bodegas` : '';
  const proveedoresInfo = Proveedores && Proveedores.length > 0 ? `, ${Proveedores.length} proveedores (solo BD)` : '';
  const descripcionesInfo = Descripciones && Descripciones.length > 0 ? `, ${Descripciones.length} descripciones` : '';
  console.log(`📊 Datos recibidos: ${Hoteles.length} hoteles, ${Servicios.length} servicios, ${Paquetes.length} paquetes${bodegasInfo}${proveedoresInfo}${descripcionesInfo}`);

  // Create AgentsClient
  const client = await createClient();
  const vectorStoreId = config.agent.vectorStoreId;

  // 1. Delete existing files
  const deletedFilesCount = await deleteExistingFiles(client, vectorStoreId);

  // 2. Create JSON files in memory
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
  // DISABLED: ProductsInformation - re-enable when in use (do not send products_information.json to IA)
   if (ProductsInformation && ProductsInformation.length > 0) {
     filesToUpload.push({
       name: 'products_information.json',
       content: JSON.stringify(ProductsInformation, null, 2),
       data: ProductsInformation
     });
   }

  // 3. Upload files to vector store
  const uploadedFiles = [];

  for (const fileData of filesToUpload) {
    const uploadedFileInfo = await uploadFile(client, vectorStoreId, fileData);
    uploadedFiles.push(uploadedFileInfo);
  }

  // 4. Save data to MySQL database
  let dbResults = null;
  try {
    dbResults = await saveAllDataToDB(Hoteles, Servicios, Paquetes, Bodegas, ProductsInformation, Descripciones, Proveedores);
  } catch (error) {
    console.error('❌ Error guardando datos en base de datos:', error.message);
    // Don't fail the entire operation if DB save fails
    dbResults = {
      error: error.message,
      hotels: { inserted: 0, updated: 0, errors: Hoteles.length, total: Hoteles.length },
      services: { inserted: 0, updated: 0, errors: Servicios.length, total: Servicios.length },
      packages: { inserted: 0, updated: 0, errors: Paquetes.length, total: Paquetes.length },
      wineries: { inserted: 0, updated: 0, errors: Bodegas?.length || 0, total: Bodegas?.length || 0 },
      products_information: { inserted: 0, updated: 0, errors: ProductsInformation?.length || 0, total: ProductsInformation?.length || 0 }, // products_information disabled
      descriptions: { inserted: 0, updated: 0, errors: Descripciones?.length || 0, total: Descripciones?.length || 0 },
      providers: { inserted: 0, updated: 0, errors: Proveedores?.length || 0, total: Proveedores?.length || 0 }
    };
  }

  // 5. Update agent prompt with new table structures (always, after DB save)
  let promptUpdated = false;
  try {
    await updateAgentPromptWithTableStructures();
    promptUpdated = true;
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
      bodegas: Bodegas?.length ?? 0,
      proveedores: Proveedores?.length ?? 0,
      products_information: ProductsInformation?.length ?? 0
    },
    database: dbResults,
    promptUpdated: promptUpdated
  };
}
