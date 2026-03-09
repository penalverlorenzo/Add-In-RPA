import { PROMPT_SERVICES } from '../prompts/services.js';

/**
 * Extract services array from combined email + image text.
 * @param {string} combinedContent - Email content + extracted image text
 * @param {Object} _masterData - Unused for services
 * @param {{ openAIClient: Object, model: string }} options
 * @returns {Promise<{ services: Array }>}
 */
export async function extractServices(combinedContent, _masterData, { openAIClient, model }) {
    const response = await openAIClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: PROMPT_SERVICES },
            { role: 'user', content: `Extrae los servicios/eventuales/programas del siguiente contenido:\n\n${combinedContent}` }
        ],
        temperature: 0.2,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
    });
    const content = response.choices[0].message.content.trim();
    const data = JSON.parse(content);
    return { services: Array.isArray(data.services) ? data.services : [] };
}
