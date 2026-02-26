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
 * Gets existing conversation or creates a new one for the user
 * Uses the new Conversations API
 * @param {string} userId - User identifier (aadObjectId)
 * @returns {Promise<string>} Conversation ID
 */
export async function getOrCreateThread(userId) {
  validateConfiguration();
  const client = createClient();

  // Check if user already has a conversation in database
  const existingChat = await masterDataService.getTeamsChatByUserId(userId);
  
  if (existingChat && existingChat.threadId) {
    console.log(`✅ Conversación encontrada para userId: ${userId}, conversationId: ${existingChat.threadId}`);
    
    // Verify conversation still exists in Azure OpenAI using the Conversations API
    try {
      const response = await fetch(`${config.assistant.endpoint}/conversations/${existingChat.threadId}`, {
        method: 'GET',
        headers: {
          'api-key': config.assistant.apiKey,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        return existingChat.threadId;
      } else {
        console.warn(`⚠️ Conversación ${existingChat.threadId} no existe en Azure OpenAI, creando una nueva...`);
      }
    } catch (fetchError) {
      console.warn(`⚠️ Error verificando conversación ${existingChat.threadId}, creando una nueva...`);
    }
  }

  // Create new conversation in Azure OpenAI using the Conversations API
  console.log(`🆕 Creando nueva conversación para userId: ${userId}...`);
  
  try {
    // Use fetch for the Conversations API as the SDK may not support it yet
    const response = await fetch(`${config.assistant.endpoint}/conversations`, {
      method: 'POST',
      headers: {
        'api-key': config.assistant.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create conversation: ${errorText}`);
    }

    const conversation = await response.json();
    const conversationId = conversation.id;
    console.log(`✅ Conversación creada: ${conversationId}`);

    // Save to database
    if (existingChat) {
      // Update existing record
      await masterDataService.updateTeamsChatThread(userId, conversationId);
    } else {
      // Create new record
      await masterDataService.createTeamsChat(userId, conversationId);
    }

    return conversationId;
  } catch (error) {
    console.error('❌ Error creating conversation:', error.message);
    throw new Error(`Error al crear conversación: ${error.message}`);
  }
}

/**
 * Sends a message to the assistant and gets the response
 * Uses the new Responses API (responses.create) which is the recommended approach
 * This API automatically adds the message, executes the model, and returns the response directly
 * @param {string} userMessage - User's message
 * @param {string} conversationId - Conversation ID (previously threadId)
 * @returns {Promise<string>} Assistant's response
 */
export async function sendMessageToAssistant(userMessage, conversationId) {
  validateConfiguration();
  const client = createClient();

  try {
    console.log(`📤 Enviando mensaje a la conversación ${conversationId}...`);
    
    // Use responses.create - this is the recommended approach
    // It automatically adds the message, executes the model, and returns the response
    // No polling needed - the response comes directly in the API call
    const response = await client.responses.create({
      model: config.openai.deployment || 'gpt-4o-mini',
      conversation: conversationId,
      input: userMessage, // Simple string input - the API handles the message format
      assistant_id: config.assistant.assistantId
    });

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
