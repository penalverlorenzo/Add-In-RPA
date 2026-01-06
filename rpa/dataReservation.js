// rpa/dataReservation.js
import { takeScreenshot } from "./utils/screenshot.js";
import { select2BySearch, fillInput } from "./helpers/utils.js";

/**
 * Llena el formulario de reserva con los datos proporcionados
 * @param {import('playwright').Page} page - Página de Playwright
 * @param {Object} reservationData - Datos de la reserva (opcional, usa datos por defecto si no se provee)
 */
export async function dataReservation(page, reservationData = null) {
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

    // Tipo de Reserva (Click-then-Select)
    await page.locator('#select2-chosen-5').waitFor({ state: 'visible' });
    await page.locator('#select2-chosen-5').click();
    await page.locator('li.select2-results-dept-0', { hasText: data.reservationType }).click();
    await page.waitForTimeout(1000);
    takeScreenshot(page, '8-dataReservation-01-reservation-type');

    // Estatus (Click-then-Select)
    await page.locator('#select2-chosen-6').waitFor({ state: 'visible' });
    await page.locator('#select2-chosen-6').click();
    await page.locator('li.select2-results-dept-0', { hasText: data.status }).click();
    await page.waitForTimeout(3000);
    takeScreenshot(page, '9-dataReservation-02-reservation-status');

    // Fecha (Usando fillInput robusto)
    await fillInput(page, '#Softur_Serene_E_Ventas_ReservaDialog22_Fec_sal', data.travelDate, true);
    takeScreenshot(page, '10-dataReservation-03-travel-date');

    // Vendedor (Usando select2BySearch)
    await select2BySearch(page,
        '#s2id_Softur_Serene_E_Ventas_ReservaDialog22_Cod_vdor',
        data.seller
    );
    takeScreenshot(page, '11-dataReservation-04-seller');

    // Cliente (Usando select2BySearch para búsqueda más robusta)
    await select2BySearch(page,
        '#s2id_Softur_Serene_E_Ventas_ReservaDialog22_Cod_agcia',
        data.client
    );
    await takeScreenshot(page, '12-dataReservation-05-client');
    
    await takeScreenshot(page, '13-dataReservation-06-details');

    await page.waitForTimeout(20000);
}

