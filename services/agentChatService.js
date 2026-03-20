import { AgentsClient } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import masterDataService from './mysqlMasterDataService.js';
import config from '../config/index.js';
import { executeSQLQuery, ensureSQLToolExists } from './agentSQLToolService.js';

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
  
  // Ensure SQL tool exists before sending message
  await ensureSQLToolExists(client, agentId);
  
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
  
  // Create run and handle tool calls
  let run = await client.runs.create(threadIdentifier.id, agentId);
  
  // Poll until completed or requires_action
  while (true) {
    run = await client.runs.get(threadIdentifier.id, run.id);
    
    console.log(`Run status: ${run.status}`);
    
    if (run.status === "completed") {
      break;
    }
    
    if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
      throw new Error(`Run ${run.status}: ${run.lastError?.message || 'Unknown error'}`);
    }
    
    if (run.status === "requires_action") {
      // Handle tool calls
      const requiredAction = run.requiredAction;
      console.log(`🔍 Required action type: ${requiredAction?.type}`);
      console.log(`🔍 Required action structure:`, JSON.stringify(requiredAction, null, 2));
      
      if (requiredAction && requiredAction.type === "submit_tool_outputs") {
        const toolCalls = requiredAction.submitToolOutputs?.toolCalls || [];
        console.log(`📋 Number of tool calls: ${toolCalls.length}`);
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
          if (toolCall.type === "function" && toolCall.function?.name === "executeSQLQuery") {
            console.log(`🔧 Executing SQL tool call: ${toolCall.id}`);
            console.log(`📋 Function name: ${toolCall.function?.name}`);
            
            try {
              // Azure AI Agents uses "arguments" not "parameters"
              const rawArguments = toolCall.function?.arguments || toolCall.function?.parameters;
              console.log(`📝 Raw arguments: ${rawArguments}`);
              console.log(`📝 Arguments type: ${typeof rawArguments}`);
              
              // Check if arguments exist at all
              if (rawArguments === undefined || rawArguments === null) {
                console.error(`❌ Arguments are undefined or null`);
                console.error(`📋 Available keys in toolCall.function:`, Object.keys(toolCall.function || {}));
                
                // Return a helpful error message to the agent
                toolOutputs.push({
                  toolCallId: toolCall.id,
                  output: JSON.stringify({
                    success: false,
                    error: 'Missing required parameters. You must provide both "tableName" (one of: "hotels", "services", "packages", "winery", "products_information", "providers") and "columns" (array of column names) as parameters when calling executeSQLQuery.',
                    example: {
                      tableName: 'hotels',
                      columns: ['HotelID', 'NombreHotel', 'Categoria', 'Precio', 'Moneda'],
                      whereClause: 'Activo = ? AND Categoria = ?',
                      whereParams: ['ACTIVADO', '5']
                    },
                    data: []
                  })
                });
                continue; // Skip to next tool call
              }
              
              // Parse function arguments - handle both string and object
              let params;
              if (typeof rawArguments === 'string') {
                try {
                  params = JSON.parse(rawArguments || "{}");
                } catch (parseError) {
                  console.error(`❌ Error parsing arguments JSON: ${parseError.message}`);
                  console.error(`   Raw string: ${rawArguments}`);
                  throw new Error(`Invalid JSON in arguments: ${parseError.message}`);
                }
              } else if (typeof rawArguments === 'object' && rawArguments !== null) {
                params = rawArguments;
              } else {
                console.error(`❌ Unexpected arguments type: ${typeof rawArguments}`);
                params = {};
              }
              
              console.log(`📊 Parsed parameters:`, JSON.stringify(params, null, 2));
              
              // Validate required parameters before executing
              if (!params.tableName) {
                console.error(`❌ Missing required parameter: tableName`);
                console.error(`📋 Available parameters:`, Object.keys(params));
                throw new Error('Missing required parameter: tableName. Please specify which table to query (hotels, services, packages, winery, products_information, or providers).');
              }
              
              if (!params.columns || !Array.isArray(params.columns) || params.columns.length === 0) {
                console.error(`❌ Missing or invalid parameter: columns`);
                throw new Error('Missing required parameter: columns. Please specify an array of column names to select.');
              }
              
              // Execute SQL query
              console.log(`🚀 Executing SQL query with params:`, {
                tableName: params.tableName,
                columns: params.columns,
                hasJoins: !!params.joins && params.joins.length > 0,
                hasWhere: !!params.whereClause,
                hasOrderBy: !!params.orderBy,
                limit: params.limit
              });
              
              const result = await executeSQLQuery(params);
              
              // Format result as JSON string
              const output = JSON.stringify(result);
              
              toolOutputs.push({
                toolCallId: toolCall.id,
                output: output
              });
              
              console.log(`✅ SQL query executed successfully, returned ${result.rowCount || 0} rows`);
            } catch (error) {
              console.error(`❌ Error executing SQL tool: ${error.message}`);
              console.error(`   Stack: ${error.stack}`);
              toolOutputs.push({
                toolCallId: toolCall.id,
                output: JSON.stringify({
                  success: false,
                  error: error.message,
                  data: [],
                  suggestion: error.message.includes('tableName') 
                    ? 'Please specify the table name (hotels, services, packages, winery, etc.) and columns to select.' 
                    : 'Please check the parameters and try again.'
                })
              });
            }
          } else {
            console.warn(`⚠️ Unknown tool call - Type: ${toolCall.type}, Function: ${toolCall.function?.name || 'N/A'}`);
            toolOutputs.push({
              toolCallId: toolCall.id,
              output: JSON.stringify({
                success: false,
                error: `Unknown tool call type: ${toolCall.type}${toolCall.function?.name ? ` (function: ${toolCall.function.name})` : ''}`
              })
            });
          }
        }
        
        // Submit tool outputs
        if (toolOutputs.length > 0) {
          console.log(`📤 Submitting ${toolOutputs.length} tool output(s)...`);
          await client.runs.submitToolOutputs(threadIdentifier.id, run.id, toolOutputs);
        }
      }
      
      // Continue polling
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Get assistant response
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
    // Remove OpenAI Agents API citation markers (e.g. 【10:0†bodegas.json】, 【5:2†source】)
    assistantResponse = textResponse.replace(/【[^】]*】/g, "").replace(/\s{2,}/g, " ").trim();
  }
  
  return assistantResponse;
}
