# Script para construir el frontend con URLs de producción
# Ejecutar: .\build-production.ps1

Write-Host "🏗️  Construyendo Add-in para Producción..." -ForegroundColor Cyan

# URLs de producción
$env:FRONTEND_URL = "https://gentle-ground-0e6ae2a1e.1.azurestaticapps.net"
$env:BACKEND_URL = "https://ca-addin-rpa-backend-1.nicemushroom-236103a4.brazilsouth.azurecontainerapps.io"

Write-Host ""
Write-Host "📋 Configuración:" -ForegroundColor Yellow
Write-Host "  Frontend URL: $env:FRONTEND_URL"
Write-Host "  Backend URL:  $env:BACKEND_URL"
Write-Host ""

# Build
Write-Host "📦 Ejecutando build..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Build completado exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📂 Archivos generados en: dist/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 Próximos pasos:" -ForegroundColor Yellow
    Write-Host "  1. Verifica que dist/manifest.xml tiene las URLs correctas"
    Write-Host "  2. Commit y push a GitHub:"
    Write-Host "     git add ."
    Write-Host "     git commit -m 'Build production version'"
    Write-Host "     git push origin main"
    Write-Host "  3. GitHub Actions desplegará automáticamente"
    Write-Host "  4. Sube dist/manifest.xml al Microsoft 365 Admin Center"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Error en el build" -ForegroundColor Red
    Write-Host "Revisa los errores arriba y corrígelos"
    exit 1
}

