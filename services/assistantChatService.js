/**
 * Assistant Chat Service - Manages conversations with Azure OpenAI Assistant
 * Handles thread creation, message sending, and response retrieval
 */

import { AzureOpenAI } from 'openai';
import config from '../config/index.js';
import masterDataService from './mysqlMasterDataService.js';

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
 * Validates the configuration for the assistant
 * @throws {Error} If configuration is missing
 */
function validateConfiguration() {
  if (!config.assistant.assistantId) {
    throw new Error('Assistant ID no configurado. Verifica la variable de entorno AZURE_OPENAI_ASSISTANT_ID');
  }

  if (!config.assistant.apiKey || !config.assistant.endpoint) {
    throw new Error('Azure OpenAI API Key o Endpoint no configurados');
  }
}

/**
 * Extracts user identifier from Bot Framework activity
 * @param {Object} activity - Bot Framework activity object
 * @returns {string} User identifier (aadObjectId)
 * @throws {Error} If user identifier cannot be extracted
 */
export function extractUserIdentifier(activity) {
  if (!activity || !activity.from) {
    throw new Error('Activity or activity.from is missing');
  }

  // Prefer aadObjectId as it's the unique identifier in Azure AD
  const userId = activity.from.aadObjectId || activity.from.id;
  
  if (!userId) {
    throw new Error('No user identifier found in activity.from (aadObjectId or id)');
  }

  return userId;
}

/**
 * Gets existing thread or creates a new one for the user
 * @param {string} userId - User identifier (aadObjectId)
 * @returns {Promise<string>} Thread ID
 */
export async function getOrCreateThread(userId) {
  validateConfiguration();

  // Check if user already has a thread in database
  const existingChat = await masterDataService.getTeamsChatByUserId(userId);
  
  if (existingChat && existingChat.threadId) {
    console.log(`✅ Thread encontrado para userId: ${userId}, threadId: ${existingChat.threadId}`);
    
    // Verify thread still exists in Azure OpenAI
    const client = createClient();
    try {
      await client.beta.threads.retrieve(existingChat.threadId);
      return existingChat.threadId;
    } catch (error) {
      console.warn(`⚠️ Thread ${existingChat.threadId} no existe en Azure OpenAI, creando uno nuevo...`);
      // Thread was deleted in Azure OpenAI, create a new one
    }
  }

  // Create new thread in Azure OpenAI
  console.log(`🆕 Creando nuevo thread para userId: ${userId}...`);
  const client = createClient();
  
  try {
    const thread = await client.beta.threads.create();
    console.log(`✅ Thread creado: ${thread.id}`);

    // Save to database
    if (existingChat) {
      // Update existing record
      await masterDataService.updateTeamsChatThread(userId, thread.id);
    } else {
      // Create new record
      await masterDataService.createTeamsChat(userId, thread.id);
    }

    return thread.id;
  } catch (error) {
    console.error('❌ Error creating thread:', error.message);
    throw new Error(`Error al crear thread: ${error.message}`);
  }
}

/**
 * Waits for a run to complete by polling
 * @param {AzureOpenAI} client - Azure OpenAI client
 * @param {string} threadId - Thread ID
 * @param {string} runId - Run ID
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default: 60000)
 * @returns {Promise<Object>} Completed run object
 */
async function waitForRunCompletion(client, threadId, runId, maxWaitTime = 60000) {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < maxWaitTime) {
    const run = await client.beta.threads.runs.retrieve(threadId, runId);
    
    if (run.status === 'completed') {
      return run;
    }
    
    if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
      throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Run timeout: The assistant took too long to respond');
}

/**
 * Sends a message to the assistant and gets the response
 * @param {string} userMessage - User's message
 * @param {string} threadId - Thread ID
 * @returns {Promise<string>} Assistant's response
 */
export async function sendMessageToAssistant(userMessage, threadId) {
  validateConfiguration();
  const client = createClient();
  const assistantId = config.assistant.assistantId;

  try {
    // Add user message to thread
    console.log(`📤 Agregando mensaje al thread ${threadId}...`);
    await client.beta.threads.create(threadId, {
      role: 'user',
      content: userMessage
    });

    // Create a run to process the message
    console.log(`🚀 Creando run del asistente...`);
    const run = await client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });

    console.log(`⏳ Esperando respuesta del asistente (runId: ${run.id})...`);
    
    // Wait for run to complete
    await waitForRunCompletion(client, threadId, run.id);

    // Get the latest messages from the thread
    console.log(`📥 Obteniendo mensajes del thread...`);
    const messages = await client.beta.threads.messages.list(threadId, {
      limit: 1
    });

    // The first message should be the assistant's response
    const assistantMessage = messages.data[0];
    
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      throw new Error('No se recibió respuesta del asistente');
    }

    // Extract text content from the message
    const content = assistantMessage.content[0];
    if (content.type === 'text') {
      const responseText = content.text.value;
      console.log(`✅ Respuesta recibida del asistente (${responseText.length} caracteres)`);
      return responseText;
    } else {
      throw new Error('Respuesta del asistente no es de tipo texto');
    }
  } catch (error) {
    console.error('❌ Error sending message to assistant:', error.message);
    throw error;
  }
}
