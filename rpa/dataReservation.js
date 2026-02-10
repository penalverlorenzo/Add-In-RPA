// rpa/dataReservation.js
import { takeScreenshot } from "./utils/screenshot.js";
import { select2BySearch, fillInput, convertToDDMMYYYY } from "./helpers/utils.js";
import { compareReservationData } from "./helpers/compareReservationData.js";

/**
 * Llena el formulario de reserva con los datos proporcionados
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} reservationData - Datos de la reserva (opcional, usa datos por defecto si no se provee)
 * @param {Object} originData - Datos originales para comparar (opcional, solo para edición)
 */
export async function dataReservation(page, reservationData = null, originData = null) {
    // Datos por defecto si no se proporcionan
    const defaultData = {
        passengers: [
            {
                lastName: 'TestLastName8',
                firstName: 'TestPass8',
                paxType: 'ADU',
                birthDate: '01/15/1990', //Debe ser MM/DD/AAAA
                nationality: 'ARGENTINA',
                sex: 'M',
                documentNumber: '12345678',
                documentType: 'DNI',
                cuilCuit: '20123456789',
                direccion: 'Test Address 123'
            }
        ],
        reservationType: 'AGENCIAS [COAG]',
        status: 'PENDIENTE DE CONFIRMACION [PC]',
        client: 'DESPEGAR - TEST - 1',
        travelDate: '12/01/2026', //Debe ser MM/DD/AAAA
        seller: 'TEST TEST',
    };

    // Usar datos proporcionados o datos por defecto
    const data = reservationData || defaultData;
    
    // Si hay datos originales, comparar y solo llenar campos que cambiaron
    const origin = originData || reservationData?.originData || null;
    const changes = origin ? compareReservationData(data, origin) : null;
    const isEdit = !!origin;

    if (isEdit) {
        console.log('📊 Modo edición: Solo se actualizarán los campos que cambiaron');
        console.log('   Cambios detectados:', Object.entries(changes)
            .filter(([_, changed]) => changed)
            .map(([field]) => field)
            .join(', ') || 'ninguno');
    }

    // Tipo de Reserva (Click-then-Select)
    if (!isEdit || changes?.reservationType) {
        await page.locator('#select2-chosen-5').waitFor({ state: 'visible' });
        await page.locator('#select2-chosen-5').click();
        await page.locator('li.select2-results-dept-0', { hasText: data.reservationType }).click();
        await page.waitForTimeout(500);
        takeScreenshot(page, '8-dataReservation-01-reservation-type');
    } else {
        console.log('⏭️  Saltando reservationType (sin cambios)');
    }

    // Estatus (Click-then-Select)
    if (!isEdit || changes?.status) {
        await page.locator('#select2-chosen-6').waitFor({ state: 'visible' });
        await page.locator('#select2-chosen-6').click();
        await page.locator('li.select2-results-dept-0', { hasText: data.status }).click();
        await page.waitForTimeout(500);
        takeScreenshot(page, '9-dataReservation-02-reservation-status');
    } else {
        console.log('⏭️  Saltando status (sin cambios)');
    }

    // Fecha (Usando fillInput robusto)
    if (!isEdit || changes?.travelDate) {
        await fillInput(page, '#Softur_Serene_E_Ventas_ReservaDialog22_Fec_sal', convertToDDMMYYYY(data.travelDate), true);
        takeScreenshot(page, '10-dataReservation-03-travel-date');
    } else {
        console.log('⏭️  Saltando travelDate (sin cambios)');
    }

    // Vendedor (Usando select2BySearch)
    if (!isEdit || changes?.seller) {
        await select2BySearch(page,
            '#s2id_Softur_Serene_E_Ventas_ReservaDialog22_Cod_vdor',
            data.seller
        );
        takeScreenshot(page, '11-dataReservation-04-seller');
    } else {
        console.log('⏭️  Saltando seller (sin cambios)');
    }

    // Cliente (Usando select2BySearch para búsqueda más robusta)
    if (!isEdit || changes?.client) {
        // Si el cliente es Despegar, usar "Consumidor Final" en su lugar
        let clientToUse = data.client;
        if (data.client && data.client.toLowerCase().includes('despegar')) {
            clientToUse = 'Consumidor Final';
            console.log(`🔄 Cliente cambiado de "${data.client}" a "Consumidor Final" (regla especial para Despegar)`);
        }
        
        await select2BySearch(page,
            '#s2id_Softur_Serene_E_Ventas_ReservaDialog22_Cod_agcia',
            clientToUse
        );
        await takeScreenshot(page, '12-dataReservation-05-client');
    } else {
        console.log('⏭️  Saltando client (sin cambios)');
    }
    
    await takeScreenshot(page, '13-dataReservation-06-details');

    await page.waitForTimeout(500);
}
