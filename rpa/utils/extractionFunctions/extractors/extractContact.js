import { PROMPT_CONTACT } from '../prompts/contact.js';

/**
 * Extract contact info and confidence from combined email + image text.
 * @param {string} combinedContent - Email content + extracted image text
 * @param {Object} _masterData - Unused for contact
 * @param {{ openAIClient: Object, model: string }} options
 * @returns {Promise<{ contactEmail: string|null, contactPhone: string|null, confidence: number }>}
 */
export async function extractContact(combinedContent, _masterData, { openAIClient, model }) {
    const response = await openAIClient.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: PROMPT_CONTACT },
            { role: 'user', content: `Extrae los datos de contacto y nivel de confianza del siguiente contenido:\n\n${combinedContent}` }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
    });
    const content = response.choices[0].message.content.trim();
    const data = JSON.parse(content);
    return {
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.5
    };
}
