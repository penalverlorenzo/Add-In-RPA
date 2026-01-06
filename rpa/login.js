// rpa/login.js
import 'dotenv/config';
import { takeScreenshot } from './utils/screenshot.js';

export async function loginITraffic(page) {
    const {
        ITRAFFIC_LOGIN_URL,
        ITRAFFIC_USER,
        ITRAFFIC_PASSWORD
    } = process.env;

    if (!ITRAFFIC_LOGIN_URL || !ITRAFFIC_USER || !ITRAFFIC_PASSWORD) {
        throw new Error('Variables de entorno de login incompletas');
    }

    await page.goto(ITRAFFIC_LOGIN_URL, {
        waitUntil: 'networkidle',
        timeout: 30000
    });

    await takeScreenshot(page, '1-login-01-page');

    // Esperar a que los campos estén disponibles
    const loginButton = page.locator('#Softur_Serene_Membership_LoginPanel0_LoginButton');

    if (await loginButton.count() > 0) {
        await page.fill('#Softur_Serene_Membership_LoginPanel0_Username', ITRAFFIC_USER);
        await page.fill('#Softur_Serene_Membership_LoginPanel0_Password', ITRAFFIC_PASSWORD);
        
        await takeScreenshot(page, '2-login-02-filled');
        
        await page.click('#Softur_Serene_Membership_LoginPanel0_LoginButton');

        // Esperar a que el botón desaparezca (login exitoso)
        await loginButton.waitFor({ state: 'hidden', timeout: 15000 });
        
        // Esperar a que cargue el dashboard (con timeout más largo y fallback)
        try {
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        } catch (e) {
            await page.waitForTimeout(3000);
        }
    }

    await takeScreenshot(page, '3-login-03-success');
}

