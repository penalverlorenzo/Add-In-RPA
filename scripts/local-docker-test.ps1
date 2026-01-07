# Script para probar la imagen Docker localmente en Windows
# Uso: .\scripts\local-docker-test.ps1

$ErrorActionPreference = "Stop"

Write-Host "🐳 Probando imagen Docker localmente..." -ForegroundColor Cyan

# Verificar que existe .env
if (-not (Test-Path ".env")) {
    Write-Host "❌ Error: No se encontró .env" -ForegroundColor Red
    Write-Host "Copia env.example a .env y configura las variables"
    exit 1
}

# Nombre de la imagen
$IMAGE_NAME = "addin-rpa-backend"
$CONTAINER_NAME = "addin-rpa-test"

# 1. Build de la imagen
Write-Host "`n📦 Construyendo imagen Docker..." -ForegroundColor Yellow
docker build -t "${IMAGE_NAME}:test" .

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Imagen construida exitosamente" -ForegroundColor Green
} else {
    Write-Host "❌ Error al construir la imagen" -ForegroundColor Red
    exit 1
}

# 2. Detener y eliminar contenedor anterior si existe
Write-Host "`n🧹 Limpiando contenedores anteriores..." -ForegroundColor Yellow
docker stop $CONTAINER_NAME 2>$null
docker rm $CONTAINER_NAME 2>$null

# 3. Ejecutar contenedor
Write-Host "`n🚀 Iniciando contenedor..." -ForegroundColor Yellow
docker run -d `
    --name $CONTAINER_NAME `
    -p 3001:3001 `
    --env-file .env `
    "${IMAGE_NAME}:test"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Contenedor iniciado" -ForegroundColor Green
} else {
    Write-Host "❌ Error al iniciar contenedor" -ForegroundColor Red
    exit 1
}

# 4. Esperar a que el servidor inicie
Write-Host "`n⏳ Esperando a que el servidor inicie..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 5. Verificar logs
Write-Host "`n📋 Logs del contenedor:" -ForegroundColor Yellow
docker logs $CONTAINER_NAME

# 6. Health check
Write-Host "`n🏥 Verificando health endpoint..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/rpa/health" -Method Get
    Write-Host "✅ Health check exitoso" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Health check falló" -ForegroundColor Red
    Write-Host "Error: $_"
    Write-Host "`nLogs del contenedor:" -ForegroundColor Yellow
    docker logs $CONTAINER_NAME
    exit 1
}

# 7. Instrucciones
Write-Host "`n✅ Contenedor corriendo exitosamente" -ForegroundColor Green
Write-Host "`n📝 Comandos útiles:"
Write-Host "  Ver logs:        docker logs -f $CONTAINER_NAME"
Write-Host "  Detener:         docker stop $CONTAINER_NAME"
Write-Host "  Eliminar:        docker rm $CONTAINER_NAME"
Write-Host "  Entrar al shell: docker exec -it $CONTAINER_NAME /bin/bash"
Write-Host ""
Write-Host "🌐 Endpoints disponibles:"
Write-Host "  Health:      http://localhost:3001/api/rpa/health"
Write-Host "  Master Data: http://localhost:3001/api/master-data"
Write-Host "  Extract:     http://localhost:3001/api/extract"
Write-Host "  Create RPA:  http://localhost:3001/api/rpa/create-reservation"
Write-Host ""
Write-Host "Para detener el contenedor, ejecuta:" -ForegroundColor Yellow
Write-Host "  docker stop $CONTAINER_NAME"

