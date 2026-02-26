/**
 * Assistant Chat Service - Manages conversations with Azure OpenAI Assistant
 * Uses the new Responses API (responses.create) which is the recommended approach
 * This API automatically adds messages, executes the model, and returns responses directly
 * No manual polling required - much faster and simpler than the deprecated Threads API
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
 * Gets the previous response ID for the user (if exists)
 * Uses previous_response_id to maintain conversation context
 * @param {string} userId - User identifier (aadObjectId)
 * @returns {Promise<string|null>} Previous response ID or null if this is the first message
 */
export async function getOrCreateThread(userId) {
  // Check if user already has a previous response ID in database
  const existingChat = await masterDataService.getTeamsChatByUserId(userId);
  
  if (existingChat && existingChat.threadId) {
    console.log(`✅ Response ID anterior encontrado para userId: ${userId}, previousResponseId: ${existingChat.threadId}`);
    return existingChat.threadId; // This is the previous response ID
  }

  // No previous response - this will be the first message in the conversation
  console.log(`🆕 Primera conversación para userId: ${userId} - no hay response anterior`);
  return null;
}

/**
 * Sends a message to the assistant and gets the response
 * Uses the new Responses API (responses.create) with previous_response_id to maintain context
 * This API automatically adds the message, executes the model, and returns the response directly
 * @param {string} userMessage - User's message
 * @param {string|null} previousResponseId - Previous response ID (null for first message)
 * @param {string} userId - User identifier (needed to save the new response ID)
 * @returns {Promise<string>} Assistant's response
 */
export async function sendMessageToAssistant(userMessage, previousResponseId, userId) {
  validateConfiguration();
  const client = createClient();

  try {
    if (previousResponseId) {
      console.log(`📤 Enviando mensaje con contexto (previousResponseId: ${previousResponseId})...`);
    } else {
      console.log(`📤 Enviando primer mensaje (sin contexto previo)...`);
    }
    
    // Build the request parameters
    const requestParams = {
      model: config.openai.deployment || 'gpt-4o-mini',
      input: userMessage, // Simple string input - the API handles the message format
      assistant_id: config.assistant.assistantId
    };

    // Add previous_response_id only if we have one (for conversation context)
    if (previousResponseId) {
      requestParams.previous_response_id = previousResponseId;
    }

    // Use responses.create - this is the recommended approach
    // It automatically adds the message, executes the model, and returns the response
    // No polling needed - the response comes directly in the API call
    const response = await client.responses.create(requestParams);

    // Save the new response ID to database for next time
    const newResponseId = response.id;
    if (newResponseId) {
      const existingChat = await masterDataService.getTeamsChatByUserId(userId);
      if (existingChat) {
        await masterDataService.updateTeamsChatThread(userId, newResponseId);
      } else {
        await masterDataService.createTeamsChat(userId, newResponseId);
      }
      console.log(`💾 Response ID guardado: ${newResponseId}`);
    }

    // Extract the response text - according to ChatGPT, response.output_text should be available directly
    if (response.output_text) {
      console.log(`✅ Respuesta recibida del asistente (${response.output_text.length} caracteres)`);
      return response.output_text;
    }

    // Fallback: try to extract from output array if output_text is not available
    if (response.output && Array.isArray(response.output)) {
      const assistantMessage = response.output.find(item => 
        item.type === 'message' && 
        item.role === 'assistant'
      );

      if (assistantMessage && assistantMessage.content) {
        const content = Array.isArray(assistantMessage.content) 
          ? assistantMessage.content 
          : [assistantMessage.content];
        
        const textContent = content.find(c => 
          c.type === 'output_text' || 
          c.type === 'text' ||
          (typeof c === 'string')
        );

        if (textContent) {
          const responseText = typeof textContent === 'string' 
            ? textContent 
            : (textContent.text || textContent.value);
          
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
