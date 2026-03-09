import { PROMPT_FLIGHTS } from '../prompts/flights.js';

/**
 * Extract flights array from combined email + image text.
 * @param {string} combinedContent - Email content + extracted image text
 * @param {Object} _masterData - Unused for flights
 * @param {{ openAIClient: Object, model: string }} options
 * @returns {Promise<{ flights: Array }>}
 */
export async function extractFlights(combinedContent, _masterData, { openAIClient, model }) {
    const response = await openAIClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: PROMPT_FLIGHTS },
            { role: 'user', content: `Extrae la información de vuelos del siguiente contenido:\n\n${combinedContent}` }
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
    });
    const content = response.choices[0].message.content.trim();
    const data = JSON.parse(content);
    return { flights: Array.isArray(data.flights) ? data.flights : [] };
}
