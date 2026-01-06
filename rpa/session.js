// rpa/session.js
import 'dotenv/config';
import { takeScreenshot } from './utils/screenshot.js';

export async function ensureSession(page) {
    const { ITRAFFIC_HOME_URL } = process.env;

    if (!ITRAFFIC_HOME_URL) {
        throw new Error('Falta ITRAFFIC_HOME_URL en variables de entorno');
    }

    // Ir directo al home (si hay sesión entra, si no redirige al login)
    await page.goto(ITRAFFIC_HOME_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    // Esperar con fallback (networkidle puede fallar con sesión activa)
    try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (e) {
        await page.waitForTimeout(2000);
    }
    
    await takeScreenshot(page, '4-session-01-check');

    const loginButton = page.locator('#Softur_Serene_Membership_LoginPanel0_LoginButton');

    if (await loginButton.count() > 0 && await loginButton.first().isVisible()) {
        return false;
    } else {
        await takeScreenshot(page, '5-session-02-ambiguous');
        return true;
    }
}

