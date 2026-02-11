/**
 * Compara los datos originales con los nuevos datos y determina qué campos cambiaron
 * @param {Object} newData - Datos nuevos que el usuario quiere guardar
 * @param {Object} originData - Datos originales de la reserva
 * @returns {Object} Objeto con flags indicando qué campos cambiaron
 */
export function compareReservationData(newData, originData) {
    if (!originData) {
        // Si no hay datos originales, todos los campos son nuevos
        return {
            reservationType: true,
            status: true,
            client: true,
            travelDate: true,
            seller: true,
            reservationDate: true,
            tourEndDate: true,
            dueDate: true,
            contact: true,
            contactEmail: true,
            contactPhone: true,
            currency: true,
            exchangeRate: true,
            commission: true,
            netAmount: true,
            grossAmount: true,
            tripName: true,
            productCode: true,
            adults: true,
            children: true,
            infants: true,
            hotel: true,
            services: true,
            flights: true,
            passengers: true
        };
    }

    // Normalizar valores para comparación (strings, nulls, undefined, etc.)
    const normalize = (value) => {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'string') return value.trim();
        return value;
    };

    // Comparar valores normalizados
    const isEqual = (val1, val2) => {
        const n1 = normalize(val1);
        const n2 = normalize(val2);
        if (n1 === null && n2 === null) return true;
        if (n1 === null || n2 === null) return false;
        return String(n1) === String(n2);
    };

    // Comparar objetos (para hotel, servicios, etc.)
    const isObjectEqual = (obj1, obj2) => {
        if (!obj1 && !obj2) return true;
        if (!obj1 || !obj2) return false;
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        for (const key of keys1) {
            if (!isEqual(obj1[key], obj2[key])) return false;
        }
        return true;
    };

    // Comparar arrays de objetos (para pasajeros, servicios)
    const isArrayEqual = (arr1, arr2) => {
        if (!arr1 && !arr2) return true;
        if (!arr1 || !arr2) return false;
        if (arr1.length !== arr2.length) return false;
        
        // Para pasajeros, comparar por documento (único identificador)
        // Para servicios, comparar por contenido completo
        for (let i = 0; i < arr1.length; i++) {
            const item1 = arr1[i];
            const item2 = arr2[i];
            
            // Si son pasajeros, comparar por documentNumber
            if (item1.documentNumber && item2.documentNumber) {
                const found = arr2.find(p => 
                    normalize(p.documentNumber) === normalize(item1.documentNumber)
                );
                if (!found || !isObjectEqual(item1, found)) return false;
            } else {
                // Para otros arrays, comparar objeto completo
                if (!isObjectEqual(item1, item2)) return false;
            }
        }
        return true;
    };

    return {
        // Campos de reserva
        reservationType: !isEqual(newData.reservationType, originData.reservationType),
        status: !isEqual(newData.status, originData.status),
        client: !isEqual(newData.client, originData.client),
        travelDate: !isEqual(newData.travelDate, originData.travelDate),
        seller: !isEqual(newData.seller, originData.seller),
        reservationDate: !isEqual(newData.reservationDate, originData.reservationDate),
        tourEndDate: !isEqual(newData.tourEndDate, originData.tourEndDate),
        dueDate: !isEqual(newData.dueDate, originData.dueDate),
        contact: !isEqual(newData.contact, originData.contact),
        contactEmail: !isEqual(newData.contactEmail, originData.contactEmail),
        contactPhone: !isEqual(newData.contactPhone, originData.contactPhone),
        currency: !isEqual(newData.currency, originData.currency),
        exchangeRate: !isEqual(newData.exchangeRate, originData.exchangeRate),
        commission: !isEqual(newData.commission, originData.commission),
        netAmount: !isEqual(newData.netAmount, originData.netAmount),
        grossAmount: !isEqual(newData.grossAmount, originData.grossAmount),
        tripName: !isEqual(newData.tripName, originData.tripName),
        productCode: !isEqual(newData.productCode, originData.productCode),
        adults: !isEqual(newData.adults, originData.adults),
        children: !isEqual(newData.children, originData.children),
        infants: !isEqual(newData.infants, originData.infants),
        
        // Hotel (comparar objeto completo)
        hotel: !isObjectEqual(newData.hotel, originData.hotel),
        
        // Servicios (comparar array completo)
        services: !isArrayEqual(newData.services || [], originData.services || []),
        
        // Vuelos (comparar array completo)
        flights: !isArrayEqual(newData.flights || [], originData.flights || []),
        
        // Pasajeros (comparar array completo)
        passengers: !isArrayEqual(newData.passengers || [], originData.passengers || [])
    };
}

/**
 * Obtiene los pasajeros que cambiaron o son nuevos
 * @param {Array} newPassengers - Lista nueva de pasajeros
 * @param {Array} originPassengers - Lista original de pasajeros
 * @returns {Array} Lista de pasajeros que cambiaron o son nuevos, con flag 'isNew' o 'isModified'
 */
export function getChangedPassengers(newPassengers, originPassengers) {
    if (!originPassengers || originPassengers.length === 0) {
        // Si no hay pasajeros originales, todos son nuevos
        return newPassengers.map(p => ({ ...p, isNew: true }));
    }

    const normalize = (value) => {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'string') return value.trim();
        return value;
    };

    const isPassengerEqual = (p1, p2) => {
        const fields = ['firstName', 'lastName', 'documentNumber', 'documentType', 
                       'birthDate', 'nationality', 'sex', 'paxType', 'cuilCuit', 
                       'phoneNumber', 'direccion'];
        for (const field of fields) {
            if (normalize(p1[field]) !== normalize(p2[field])) {
                return false;
            }
        }
        return true;
    };

    const changed = [];
    
    for (const newPassenger of newPassengers) {
        const docNumber = normalize(newPassenger.documentNumber);
        const originPassenger = originPassengers.find(p => 
            normalize(p.documentNumber) === docNumber && docNumber !== null
        );

        if (!originPassenger) {
            // Pasajero nuevo
            changed.push({ ...newPassenger, isNew: true });
        } else if (!isPassengerEqual(newPassenger, originPassenger)) {
            // Pasajero modificado
            changed.push({ ...newPassenger, isModified: true });
        }
        // Si es igual, no se agrega (no cambió)
    }

    return changed;
}
