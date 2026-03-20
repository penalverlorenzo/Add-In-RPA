/**
 * Resets Teams bot conversation state: deletes remote thread (best effort) and clears threadId in teams_chats.
 */

import { AzureOpenAI } from 'openai';
import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import config from '../config/index.js';
import masterDataService from './mysqlMasterDataService.js';

const RESET_SUCCESS_MESSAGE = 'Reiniciado correctamente';

function createAssistantClient() {
  return new AzureOpenAI({
    apiKey: config.assistant.apiKey,
    endpoint: config.assistant.endpoint,
    apiVersion: config.assistant.apiVersion
  });
}

async function createAgentsClient() {
  const credential = new DefaultAzureCredential();
  return new AgentsClient(config.agent.projectId, credential);
}

/**
 * Deletes Azure OpenAI Assistants thread for the user and clears teams_chats.threadId.
 * @param {string} userId - Teams / AAD user identifier
 * @returns {Promise<string>} User-facing confirmation message
 */
export async function resetAssistantTeamsChatForUser(userId) {
  const existing = await masterDataService.getTeamsChatByUserId(userId);
  const threadId = existing?.threadId;

  if (threadId && config.assistant.apiKey && config.assistant.endpoint) {
    try {
      const client = createAssistantClient();
      await client.beta.threads.del(threadId);
      console.log(`✅ Assistant thread deleted: ${threadId}`);
    } catch (error) {
      console.warn(`⚠️ Could not delete assistant thread ${threadId}:`, error.message);
    }
  }

  await masterDataService.clearTeamsChatThread(userId);
  return RESET_SUCCESS_MESSAGE;
}

/**
 * Deletes Azure AI Agents thread for the user and clears teams_chats.threadId.
 * @param {string} userId - Teams / AAD user identifier
 * @returns {Promise<string>} User-facing confirmation message
 */
export async function resetAgentTeamsChatForUser(userId) {
  const existing = await masterDataService.getTeamsChatByUserId(userId);
  const threadId = existing?.threadId;

  if (threadId && config.agent.projectId) {
    try {
      const client = await createAgentsClient();
      await client.threads.delete(threadId);
      console.log(`✅ Agent thread deleted: ${threadId}`);
    } catch (error) {
      console.warn(`⚠️ Could not delete agent thread ${threadId}:`, error.message);
    }
  }

  await masterDataService.clearTeamsChatThread(userId);
  return RESET_SUCCESS_MESSAGE;
}
