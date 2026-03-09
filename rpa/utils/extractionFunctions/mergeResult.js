/**
 * Merges partial extraction results into a single object matching the format
 * expected by extractionService.validateExtractionResult.
 * @param {Object} params - Partial results from each extractor
 * @param {Array} params.passengers - From extractPassengers
 * @param {Object} params.reservation - From extractReservationFields
 * @param {{ hotel: Object|null }} params.hotel - From extractHotel
 * @param {{ services: Array }} params.services - From extractServices
 * @param {{ flights: Array }} params.flights - From extractFlights
 * @param {{ contactEmail: string|null, contactPhone: string|null, confidence: number }} params.contact - From extractContact
 * @returns {Object} Full extraction object (same shape as single-prompt response)
 */
export function mergePartialResults({ passengers, reservation, hotel, services, flights, contact }) {
    const hotelData = hotel?.hotel ?? null;
    const checkIn = hotelData?.in ?? reservation?.travelDate ?? null;
    const checkOut = hotelData?.out ?? reservation?.tourEndDate ?? null;

    return {
        passengers: Array.isArray(passengers?.passengers) ? passengers.passengers : [],
        codigo: reservation?.codigo ?? null,
        reservationType: reservation?.reservationType ?? null,
        status: reservation?.status ?? null,
        estadoDeuda: reservation?.estadoDeuda ?? null,
        reservationDate: reservation?.reservationDate ?? null,
        travelDate: reservation?.travelDate ?? null,
        tourEndDate: reservation?.tourEndDate ?? null,
        dueDate: reservation?.dueDate ?? null,
        seller: reservation?.seller ?? null,
        client: reservation?.client ?? null,
        contact: reservation?.contact ?? null,
        currency: reservation?.currency ?? null,
        exchangeRate: reservation?.exchangeRate ?? 0,
        commission: reservation?.commission ?? 0,
        netAmount: reservation?.netAmount ?? 0,
        grossAmount: reservation?.grossAmount ?? 0,
        tripName: reservation?.tripName ?? null,
        productCode: reservation?.productCode ?? null,
        adults: reservation?.adults ?? 0,
        children: reservation?.children ?? 0,
        infants: reservation?.infants ?? 0,
        provider: reservation?.provider ?? null,
        reservationCode: reservation?.reservationCode ?? null,
        detailType: reservation?.detailType ?? null,
        hotel: hotelData,
        checkIn,
        checkOut,
        flights: Array.isArray(flights?.flights) ? flights.flights : [],
        services: Array.isArray(services?.services) ? services.services : [],
        contactEmail: contact?.contactEmail ?? null,
        contactPhone: contact?.contactPhone ?? null,
        confidence: typeof contact?.confidence === 'number' ? contact.confidence : 0.5
    };
}
