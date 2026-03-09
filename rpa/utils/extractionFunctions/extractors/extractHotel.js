import { PROMPT_HOTEL } from '../prompts/hotel.js';

/**
 * Extract hotel object from combined email + image text.
 * @param {string} combinedContent - Email content + extracted image text
 * @param {Object} _masterData - Unused for hotel
 * @param {{ openAIClient: Object, model: string }} options
 * @returns {Promise<{ hotel: Object|null }>}
 */
export async function extractHotel(combinedContent, _masterData, { openAIClient, model }) {
    const response = await openAIClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: PROMPT_HOTEL },
            { role: 'user', content: `Extrae la información de hotel del siguiente contenido:\n\n${combinedContent}` }
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
    });
    const content = response.choices[0].message.content.trim();
    const data = JSON.parse(content);
    return { hotel: data.hotel ?? null };
}
