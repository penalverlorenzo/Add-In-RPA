/**
 * Agent File Service - Manages files in Azure OpenAI Assistant Vector Store
 * Handles uploading and updating files for the assistant
 */

import { AzureOpenAI } from 'openai';
import config from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { saveAllDataToDB } from './agentDataService.js';

/**
 * Validates the configuration for the assistant
 * @throws {Error} If configuration is missing
 */
function validateConfiguration() {
  if (!config.assistant.assistantId || !config.assistant.vectorStoreId) {
    throw new Error('Assistant ID o Vector Store ID no configurados. Verifica las variables de entorno AZURE_OPENAI_ASSISTANT_ID y AZURE_OPENAI_VECTOR_STORE_ID');
  }

  if (!config.assistant.apiKey || !config.assistant.endpoint) {
    throw new Error('Azure OpenAI API Key o Endpoint no configurados');
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

  // Tarifas is optional
  if (Tarifas !== undefined && !Array.isArray(Tarifas)) {
    throw new Error('El campo "Tarifas" debe ser un array si se proporciona');
  }

  // Descripciones is optional
  if (Descripciones !== undefined && !Array.isArray(Descripciones)) {
    throw new Error('El campo "Descripciones" debe ser un array si se proporciona');
  }
}

/**
 * Creates Azure OpenAI client
 * @returns {AzureOpenAI} Configured client
 */
function createClient() {
  return new AzureOpenAI({
    apiKey: config.assistant.apiKey,
    endpoint: config.assistant.endpoint,
    apiVersion: config.assistant.apiVersion
  });
}

/**
 * Lists and deletes all existing files from Azure OpenAI
 * Deletes files directly from Azure OpenAI storage, which automatically removes them from the vector store
 * @param {AzureOpenAI} client - Azure OpenAI client
 * @param {string} vectorStoreId - Vector store ID
 * @returns {Promise<number>} Number of deleted files
 */
async function deleteExistingFiles(client, vectorStoreId) {
  console.log('🔍 Listando archivos existentes en el vector store...');
  const existingFiles = await client.files.list();
  const filesToDelete = existingFiles.data || [];
  
  console.log(`📋 Encontrados ${filesToDelete.length} archivos existentes`);

  if (filesToDelete.length > 0) {
    console.log('🗑️ Eliminando archivos existentes de Azure OpenAI...');
    const deletePromises = filesToDelete.map(async (file) => {
      try {
        // Get the file ID (it might be file.id or file.file_id depending on the API response)
        const fileId = file.file_id || file.id;
        
        // Delete file directly from Azure OpenAI storage
        // This will automatically remove it from the vector store and free up storage space
        await client.vectorStores.files.del(vectorStoreId, fileId);
        await client.files.del(fileId);
        console.log(`   ✅ Archivo eliminado de Azure OpenAI: ${fileId}`);
      } catch (error) {
        console.error(`   ❌ Error al eliminar archivo ${file.file_id || file.id}:`, error.message);
        // Continuar aunque falle la eliminación de un archivo
      }
    });
    
    await Promise.all(deletePromises);
    console.log('✅ Archivos existentes eliminados de Azure OpenAI');
  } else {
    console.log('ℹ️ No hay archivos existentes para eliminar');
  }

  return filesToDelete.length;
}

/**
 * Uploads a single file to the vector store
 * @param {AzureOpenAI} client - Azure OpenAI client
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

    // Upload file with purpose 'assistants'
    console.log(`   📤 Subiendo ${fileData.name}...`);
    const uploadedFile = await client.files.create({
      file: fileStream,
      purpose: 'assistants'
    });

    console.log(`   ✅ Archivo subido: ${uploadedFile.id} (${fileData.name})`);

    // Associate file to vector store
    const vectorStoreFile = await client.vectorStores.files.create(vectorStoreId, {
      file_id: uploadedFile.id
    });

    console.log(`   ✅ Archivo asociado al vector store: ${vectorStoreFile.id}`);
    
    return {
      fileName: fileData.name,
      fileId: uploadedFile.id,
      vectorStoreFileId: vectorStoreFile.id,
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
 * Updates agent files in the vector store
 * @param {Object} body - Request body with Hoteles, Servicios, Paquetes arrays, Bodegas (optional), Tarifas (optional), Descripciones (optional)
 * @returns {Promise<Object>} Result with deleted files count, uploaded files info, and summary
 */
export async function updateAgentFiles(body) {
  // Validate configuration
  validateConfiguration();

  // Validate body
  validateBody(body);

  const { Hoteles, Servicios, Paquetes, Bodegas, Tarifas, Descripciones } = body;
  const bodegasInfo = Bodegas && Bodegas.length > 0 ? `, ${Bodegas.length} bodegas` : '';
  const tarifasInfo = Tarifas && Tarifas.length > 0 ? `, ${Tarifas.length} tarifas` : '';
  const descripcionesInfo = Descripciones && Descripciones.length > 0 ? `, ${Descripciones.length} descripciones` : '';
  console.log(`📊 Datos recibidos: ${Hoteles.length} hoteles, ${Servicios.length} servicios, ${Paquetes.length} paquetes${bodegasInfo}${tarifasInfo}${descripcionesInfo}`);

  // Create Azure OpenAI client
  const client = createClient();
  const vectorStoreId = config.assistant.vectorStoreId;

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
  if (Tarifas && Tarifas.length > 0) {
    filesToUpload.push({
      name: 'tarifas.json',
      content: JSON.stringify(Tarifas, null, 2),
      data: Tarifas
    });
  }

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
    dbResults = await saveAllDataToDB(Hoteles, Servicios, Paquetes, Bodegas, Tarifas, Descripciones);
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
      saleRates: { inserted: 0, updated: 0, errors: Tarifas?.length || 0, total: Tarifas?.length || 0 },
      descriptions: { inserted: 0, updated: 0, errors: Descripciones?.length || 0, total: Descripciones?.length || 0 }
    };
  }

  return {
    deletedFiles: deletedFilesCount,
    uploadedFiles: uploadedFiles,
    summary: {
      hoteles: Hoteles.length,
      servicios: Servicios.length,
      paquetes: Paquetes.length,
      bodegas: Bodegas?.length ?? 0,
      tarifas: Tarifas?.length ?? 0
    },
    database: dbResults
  };
}
