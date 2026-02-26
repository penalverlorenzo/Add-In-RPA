/**
 * Assistant Chat Service - Manages conversations with Azure OpenAI Assistant
 * Uses Azure AI Agents API (AgentsClient) which is the recommended approach
 * This API uses threads, messages, and runs to handle conversations
 */

import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import config from '../config/index.js';
import masterDataService from './mysqlMasterDataService.js';

/**
 * Creates Azure AI Agents client and gets the agent
 * @returns {Promise<{client: AgentsClient, agent: any}>} Client and agent
*/
async function createClient() {
  const projectEndpoint = config.openai.endpoint;
  if (!projectEndpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT no configurado');
  }
  
  const client = new AgentsClient(projectEndpoint, new DefaultAzureCredential());
  const agent = await client.getAgent(config.assistant.assistantId);
  return { client, agent };
}

/**
 * Validates the configuration for the assistant
 * @throws {Error} If configuration is missing
 */
function validateConfiguration() {
  if (!config.assistant.assistantId) {
    throw new Error('Assistant ID no configurado. Verifica la variable de entorno AZURE_OPENAI_ASSISTANT_ID');
  }

  if (!config.openai.endpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT no configurado');
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
 * Uses Azure AI Agents threads API
 * @param {string} userId - User identifier (aadObjectId)
 * @returns {Promise<string>} Thread ID
 */
export async function getOrCreateThread(userId) {
  validateConfiguration();
  const { client } = await createClient();

  // Check if user already has a thread in database
  const existingChat = await masterDataService.getTeamsChatByUserId(userId);
  
  if (existingChat && existingChat.threadId) {
    console.log(`✅ Thread encontrado para userId: ${userId}, threadId: ${existingChat.threadId}`);
    
    // Verify thread still exists (try to list messages to check)
    try {
      const messagesIterator = client.messages.list(existingChat.threadId);
      // Just check if we can access it (try to get first item, but don't require it)
      await messagesIterator.next();
      return existingChat.threadId;
    } catch (error) {
      console.warn(`⚠️ Thread ${existingChat.threadId} no existe o no es accesible, creando uno nuevo...`);
      console.warn(`   Error: ${error.message}`);
    }
  }

  // Create new thread
  console.log(`🆕 Creando nuevo thread para userId: ${userId}...`);
  
  try {
    const thread = await client.threads.create();
    const threadId = thread.id;
    console.log(`✅ Thread creado: ${threadId}`);

    // Save to database
    if (existingChat) {
      // Update existing record
      await masterDataService.updateTeamsChatThread(userId, threadId);
    } else {
      // Create new record
      await masterDataService.createTeamsChat(userId, threadId);
    }

    return threadId;
  } catch (error) {
    console.error('❌ Error creating thread:', error.message);
    throw new Error(`Error al crear thread: ${error.message}`);
  }
}

/**
 * Sends a message to the assistant and gets the response
 * Uses Azure AI Agents API: creates message, runs the agent, and retrieves response
 * @param {string} userMessage - User's message
 * @param {string} threadId - Thread ID
 * @param {string} userId - User identifier (for logging)
 * @returns {Promise<string>} Assistant's response
 */
export async function sendMessageToAssistant(userMessage, threadId, userId) {
  validateConfiguration();
  const { client, agent } = await createClient();

  try {
    console.log(`📤 Enviando mensaje al thread ${threadId}...`);
    
    // Create a user message
    const message = await client.messages.create(threadId, 'user', userMessage);
    console.log(`✅ Mensaje creado, message ID: ${message.id}`);

    // Create and poll a run
    console.log(`🚀 Creando run del asistente...`);
    const run = await client.runs.createAndPoll(threadId, agent.id, {
      pollingOptions: {
        intervalInMs: 2000,
      },
      onResponse: (response) => {
        const parsedBody =
          typeof response.parsedBody === 'object' && response.parsedBody !== null
            ? response.parsedBody
            : null;
        const status = parsedBody && 'status' in parsedBody ? parsedBody.status : 'unknown';
        console.log(`   📊 Run status: ${status}`);
      },
    });
    
    console.log(`✅ Run finalizado con status: ${run.status}`);

    if (run.status !== 'completed') {
      throw new Error(`Run no completado. Status: ${run.status}`);
    }

    // Get the latest messages from the thread
    console.log(`📥 Obteniendo mensajes del thread...`);
    const messagesIterator = client.messages.list(threadId);
    
    // Collect all messages
    const messages = [];
    for await (const m of messagesIterator) {
      messages.push(m);
    }

    // Find the latest assistant message (should be the most recent)
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      throw new Error('No se encontró respuesta del asistente');
    }

    // Get the most recent assistant message (last in the array)
    const assistantMessage = assistantMessages[assistantMessages.length - 1];

    // Extract text content from the message
    if (assistantMessage.content && Array.isArray(assistantMessage.content)) {
      for (const content of assistantMessage.content) {
        if (content.type === 'text' && 'text' in content && content.text?.value) {
          const responseText = content.text.value;
          console.log(`✅ Respuesta recibida del asistente (${responseText.length} caracteres)`);
          return responseText;
        }
      }
    }

    throw new Error('No se pudo extraer la respuesta del asistente del formato de respuesta');
  } catch (error) {
    console.error('❌ Error sending message to assistant:', error.message);
    throw error;
  }
}
