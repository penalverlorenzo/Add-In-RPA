import { PROMPT_PASSENGERS } from '../prompts/passengers.js';

/**
 * Extract passengers array from combined email + image text.
 * @param {string} combinedContent - Email content + extracted image text
 * @param {Object} _masterData - Unused for passengers
 * @param {{ openAIClient: Object, model: string }} options
 * @returns {Promise<{ passengers: Array }>}
 */
export async function extractPassengers(combinedContent, _masterData, { openAIClient, model }) {
    const response = await openAIClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: PROMPT_PASSENGERS },
            { role: 'user', content: `Extrae la lista de pasajeros del siguiente contenido:\n\n${combinedContent}` }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
    });
    const content = response.choices[0].message.content.trim();
    const data = JSON.parse(content);
    return { passengers: Array.isArray(data.passengers) ? data.passengers : [] };
}
