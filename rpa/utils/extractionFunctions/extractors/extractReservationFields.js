import { getReservationPrompt } from '../prompts/reservation.js';

/**
 * Extract reservation (iTraffic) fields from combined email + image text.
 * @param {string} combinedContent - Email content + extracted image text
 * @param {Object} masterData - Optional { reservationTypes, statuses, sellers, clients }
 * @param {{ openAIClient: Object, model: string }} options
 * @returns {Promise<Object>} Partial reservation fields
 */
export async function extractReservationFields(combinedContent, masterData, { openAIClient, model }) {
    const systemPrompt = getReservationPrompt(masterData);
    const response = await openAIClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Extrae los datos de reserva del siguiente contenido:\n\n${combinedContent}` }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
    });
    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);
}
