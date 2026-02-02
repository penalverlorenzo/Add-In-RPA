import { takeScreenshot } from "./utils/screenshot.js";

export async function saveReservation(page) {
    // await page.locator('.button-inner', { hasText: 'Guardar' }).click();
    const applyButton = page.locator('.tool-button.apply-changes-button[title="Aplicar cambios"]');
    await applyButton.waitFor({ state: 'visible', timeout: 5000 });
    await applyButton.click();
    await page.waitForTimeout(500);
    
    // Verificar si aparece un diálogo de alerta indicando que ya existe una reserva
    const alertDialog = page.locator('.ui-dialog.s-AlertDialog:has(.ui-dialog-title:has-text("Alerta"))').first();
    try {
        await alertDialog.waitFor({ state: 'visible', timeout: 3000 });
        
        // Verificar que el mensaje sea el de reserva duplicada
        const alertMessage = alertDialog.locator('.ui-dialog-content .message').first();
        const messageText = await alertMessage.textContent();
        
        if (messageText && messageText.includes('Ya existe una Reserva')) {
            console.log('❌ Alerta detectada: Ya existe una reserva duplicada');
            console.log(`   Mensaje: ${messageText.trim()}`);
            
            // Cerrar el diálogo haciendo click en OK
            const okButton = alertDialog.locator('button:has-text("OK")').first();
            await okButton.waitFor({ state: 'visible', timeout: 2000 });
            await okButton.click();
            await page.waitForTimeout(300);
            
            // Esperar a que el diálogo se cierre
            await alertDialog.waitFor({ state: 'hidden', timeout: 3000 });
            
            await takeScreenshot(page, '17-saveReservation-error-duplicate');
            
            // Lanzar error para que el RPA lo capture
            throw new Error('Ya existe una Reserva para el Cliente, la misma Fecha Salida y el mismo Pasajero');
        }
    } catch (alertError) {
        // Si el error es el que lanzamos nosotros (reserva duplicada), relanzarlo
        if (alertError.message && alertError.message.includes('Ya existe una Reserva')) {
            throw alertError;
        }
        // Si no es el diálogo de alerta, continuar normalmente
        console.log('ℹ️ No apareció diálogo de alerta de reserva duplicada, continuando...');
    }
    
    // Verificar si aparece un diálogo de confirmación sobre elementos eliminados
    const confirmDialog = page.locator('.ui-dialog.s-ConfirmDialog:has(.ui-dialog-title:has-text("Confirmar"))').first();
    try {
        await confirmDialog.waitFor({ state: 'visible', timeout: 3000 });
        console.log('✅ Diálogo de confirmación encontrado (elementos eliminados)');
        
        // Buscar el botón "Sí" dentro del diálogo de confirmación
        const yesButton = confirmDialog.locator('button:has-text("Sí")').first();
        await yesButton.waitFor({ state: 'visible', timeout: 2000 });
        await yesButton.click();
        console.log('✅ Click en botón "Sí" de confirmación');
        await page.waitForTimeout(500);
        
        // Esperar a que el diálogo de confirmación se cierre
        await confirmDialog.waitFor({ state: 'hidden', timeout: 3000 });
        console.log('✅ Diálogo de confirmación cerrado');
    } catch (confirmError) {
        // Si no aparece el diálogo de confirmación, no es un error, simplemente continuar
        console.log('ℹ️ No apareció diálogo de confirmación, continuando...');
    }
    
    await page.waitForTimeout(500);
    await takeScreenshot(page, '17-saveReservation-01-saved');
    console.log('✅ Reserva guardada');
}
