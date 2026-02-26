import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import masterDataService from './mysqlMasterDataService.js';
import config from '../config/index.js';

const projectEndpoint = config.agent.projectId;

async function createClient () {
  const credential = new DefaultAzureCredential();
  const client = new AgentsClient(projectEndpoint, credential);
  return client;
}

/**
 * Gets existing thread or creates a new one for the user using AgentsClient
 * @param {string} userId - User identifier (aadObjectId)
 * @returns {Promise<string>} Thread ID
 */
export async function getOrCreateAgentThread(userId) {
  // Check if user already has a thread in database
  const existingChat = await masterDataService.getTeamsChatByUserId(userId);
  
  if (existingChat && existingChat.threadId) {
    console.log(`✅ Thread encontrado para userId: ${userId}, threadId: ${existingChat.threadId}`);
    
    // Verify thread still exists in AgentsClient
    const client = await createClient();
    try {
      const thread = await client.threads.get(existingChat.threadId);
      if (thread) {
        return existingChat.threadId;
      }
    } catch (error) {
      console.warn(`⚠️ Thread ${existingChat.threadId} no existe en AgentsClient, creando uno nuevo...`);
      // Thread was deleted in AgentsClient, create a new one
    }
  }

  // Create new thread in AgentsClient
  console.log(`🆕 Creando nuevo thread para userId: ${userId}...`);
  const client = await createClient();
  
  try {
    const thread = await client.threads.create();
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

export async function sendMessageToAgent(userMessage, agentId, threadId) {
  const client = await createClient();
  const agent = await client.getAgent(agentId);
  
  // Try to get existing thread, if it doesn't exist or fails, create a new one
  let threadIdentifier;
  try {
    threadIdentifier = await client.threads.get(threadId);
    if (!threadIdentifier) {
      console.log(`⚠️ Thread ${threadId} no encontrado en AgentsClient, creando uno nuevo...`);
      threadIdentifier = await client.threads.create();
      console.log(`✅ Nuevo thread creado: ${threadIdentifier.id}`);
    } else {
      console.log(`✅ Thread encontrado: ${threadIdentifier.id}`);
    }
  } catch (error) {
    console.warn(`⚠️ Error obteniendo thread ${threadId}, creando uno nuevo:`, error.message);
    threadIdentifier = await client.threads.create();
    console.log(`✅ Nuevo thread creado: ${threadIdentifier.id}`);
  }
  
  console.log(`📤 Enviando mensaje al thread ${threadIdentifier.id}`);
  const message = await client.messages.create(threadIdentifier.id, "user" ,userMessage);
  const run = await client.runs.createAndPoll(threadIdentifier.id, agentId, {
    pollingOptions: {intervalInMs: 1000}, onResponse: (response) => {
      console.log(response);
      const parsedResponse = typeof response.parsedBody === 'object' && response.parsedBody !== null ? response.parsedBody : JSON.parse(response.parsedBody);
      const status = response.parsedBody.status;
      console.log(`Run status: ${status} with output: ${JSON.stringify(parsedResponse)}`);
    }
  })
 // const run = await thread.run(modelDeployName, {
   // input: userMessage
  //});
  let assistantResponse = "";
  if (run.status === "completed") {

    let assistantMessage = null;

for await (const msg of client.messages.list(threadIdentifier.id)) {
  if (msg.role === "assistant") {
    assistantMessage = msg;
    break; // el primero que encuentre (vienen newest-first)
  }
}

if (!assistantMessage) {
  throw new Error("No assistant response found");
}

let textResponse = "";

if (Array.isArray(assistantMessage.content)) {
  textResponse = assistantMessage.content
    .filter(c => c.type === "output_text" || c.type === "text")
    .map(c => {
      if (typeof c.text === "string") return c.text;
      if (c.text?.value) return c.text.value;
      return "";
    })
    .join("\n");
} else if (typeof assistantMessage.content === "string") {
  textResponse = assistantMessage.content;
}

console.log("AI Response:", textResponse);
assistantResponse = textResponse;
}
  return assistantResponse;
}
