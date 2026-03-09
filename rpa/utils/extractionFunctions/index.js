/**
 * Run all extraction functions in parallel and merge results into the full reservation object.
 * @param {string} combinedContent - Email content + extracted image text (same for all extractors)
 * @param {Object} masterData - Optional { reservationTypes, statuses, sellers, clients } for reservation fields
 * @param {{ openAIClient: Object, model: string }} options - OpenAI client and model name
 * @returns {Promise<Object>} Full extraction object (same format as single-prompt extraction)
 */
import { mergePartialResults } from './mergeResult.js';
import { extractPassengers } from './extractors/extractPassengers.js';
import { extractReservationFields } from './extractors/extractReservationFields.js';
import { extractHotel } from './extractors/extractHotel.js';
import { extractServices } from './extractors/extractServices.js';
import { extractFlights } from './extractors/extractFlights.js';
import { extractContact } from './extractors/extractContact.js';

export async function runAllExtractions(combinedContent, masterData, { openAIClient, model }) {
    if (!openAIClient || !model) {
        throw new Error('openAIClient and model are required');
    }

    const opts = { openAIClient, model };

    const [passengers, reservation, hotel, services, flights, contact] = await Promise.all([
        extractPassengers(combinedContent, masterData, opts),
        extractReservationFields(combinedContent, masterData, opts),
        extractHotel(combinedContent, masterData, opts),
        extractServices(combinedContent, masterData, opts),
        extractFlights(combinedContent, masterData, opts),
        extractContact(combinedContent, masterData, opts)
    ]);

    return mergePartialResults({
        passengers,
        reservation,
        hotel,
        services,
        flights,
        contact
    });
}

export { mergePartialResults } from './mergeResult.js';
export { extractPassengers } from './extractors/extractPassengers.js';
export { extractReservationFields } from './extractors/extractReservationFields.js';
export { extractHotel } from './extractors/extractHotel.js';
export { extractServices } from './extractors/extractServices.js';
export { extractFlights } from './extractors/extractFlights.js';
export { extractContact } from './extractors/extractContact.js';
