import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio donde se guardarán las cookies y el estado de la sesión
const SESSION_DIR = path.join(__dirname, '..', '.browser-session');
const isHeadless = process.env.HEADLESS === 'true';
export async function createBrowser() {
  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled', // Evitar detección de automatización
      '--disable-dev-shm-usage',
      '--disable-web-security', // Deshabilitar CORS para evitar bloqueos
      '--disable-features=IsolateOrigins,site-per-process' // Evitar problemas de aislamiento
    ]
  });

  // Crear contexto persistente que guarda cookies automáticamente
  const context = await browser.newContext({
    storageState: await loadStorageState(),
    // Configuraciones importantes para headless
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Bloquear Service Workers que pueden interceptar peticiones
    serviceWorkers: 'block',
    // Headers adicionales para evitar detección
    extraHTTPHeaders: {
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });

  const page = await context.newPage();
  
  // Ocultar propiedades de automatización
  await page.addInitScript(() => {
    // Ocultar webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    
    // Sobrescribir plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Sobrescribir languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['es-ES', 'es', 'en'],
    });
    
    // Asegurar que los eventos se disparen correctamente
    if (typeof window !== 'undefined') {
      // Mejorar el manejo de eventos para headless
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        // Asegurar que los listeners se registren correctamente
        return originalAddEventListener.call(this, type, listener, options);
      };
    }
  });

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
