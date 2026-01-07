# Usar imagen base de Node.js 20 con soporte para Playwright
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el código fuente
COPY server/ ./server/
COPY rpa/ ./rpa/
COPY services/ ./services/
COPY config/ ./config/

# Instalar navegadores de Playwright (ya vienen en la imagen base, pero aseguramos)
RUN npx playwright install chromium

# Crear directorio para screenshots
RUN mkdir -p /app/screenshots && chmod 777 /app/screenshots

# Exponer puerto
EXPOSE 3001

# Variables de entorno por defecto (se sobrescriben en Azure)
ENV NODE_ENV=production
ENV PORT=3001

# Comando para iniciar el servidor
CMD ["node", "server/rpaServer.js"]

