import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio donde se guardarán las cookies y el estado de la sesión
const SESSION_DIR = path.join(__dirname, '..', '.browser-session');

export async function createBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  // Crear contexto persistente que guarda cookies automáticamente
  const context = await browser.newContext({
    storageState: await loadStorageState()
  });

  const page = await context.newPage();

  return { browser, page, context };
}

export async function saveSession(context) {
  try {
    const storageState = await context.storageState();
    
    // Crear directorio si no existe
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
    
    // Guardar estado de sesión (cookies, localStorage, etc.)
    fs.writeFileSync(
      path.join(SESSION_DIR, 'session.json'),
      JSON.stringify(storageState, null, 2)
    );
  } catch (error) {
    // Error silencioso
  }
}

async function loadStorageState() {
  try {
    const sessionFile = path.join(SESSION_DIR, 'session.json');
    
    if (fs.existsSync(sessionFile)) {
      return JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    }
  } catch (error) {
    // Error silencioso
  }
  
  return undefined;
}

