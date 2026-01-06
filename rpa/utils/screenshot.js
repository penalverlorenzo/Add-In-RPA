import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio para screenshots (en la raíz del proyecto)
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');

export async function takeScreenshot(page, name) {
    try {
        // Crear directorio si no existe
        if (!fs.existsSync(SCREENSHOTS_DIR)) {
            fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        }
        
        // Generar ID único: timestamp + random
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `${name}-${uniqueId}.png`)
        });
    } catch (error) {
        // Error silencioso
    }
}

