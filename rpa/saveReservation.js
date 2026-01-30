import { takeScreenshot } from "./utils/screenshot.js";

export async function saveReservation(page) {
    // await page.locator('.button-inner', { hasText: 'Guardar' }).click();
    const applyButton = page.locator('.tool-button.apply-changes-button[title="Aplicar cambios"]');
    await applyButton.waitFor({ state: 'visible', timeout: 10000 });
    await applyButton.click();
    await page.waitForTimeout(1000);
    
    // Verificar si aparece un diálogo de confirmación sobre elementos eliminados
    const confirmDialog = page.locator('.ui-dialog.s-ConfirmDialog:has(.ui-dialog-title:has-text("Confirmar"))').first();
    try {
        await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✅ Diálogo de confirmación encontrado (elementos eliminados)');
        
        // Buscar el botón "Sí" dentro del diálogo de confirmación
        const yesButton = confirmDialog.locator('button:has-text("Sí")').first();
        await yesButton.waitFor({ state: 'visible', timeout: 3000 });
        await yesButton.click();
        console.log('✅ Click en botón "Sí" de confirmación');
        await page.waitForTimeout(1000);
        
        // Esperar a que el diálogo de confirmación se cierre
        await confirmDialog.waitFor({ state: 'hidden', timeout: 5000 });
        console.log('✅ Diálogo de confirmación cerrado');
    } catch (confirmError) {
        // Si no aparece el diálogo de confirmación, no es un error, simplemente continuar
        console.log('ℹ️ No apareció diálogo de confirmación, continuando...');
    }
    
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '17-saveReservation-01-saved');
    console.log('✅ Reserva guardada');
}
