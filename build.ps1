param(
    [switch]$Release,
    [switch]$Deploy
)

$ErrorActionPreference = "Stop"

$IMAGE = "infoluck/image"
$VERSION = if (Test-Path "VERSION") { (Get-Content "VERSION").Trim() } else { "1.0.0-alpha" }

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ZapZap - Build & Push Docker Image      " -ForegroundColor Cyan
Write-Host "  Versao: $VERSION                        " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# Carrega variaveis do .env se existir (DEPLOY_DEV_URL / DEPLOY_PROD_URL)
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'))
        }
    }
}

# 1. Confere tipos antes de gerar a imagem
Write-Host "`n[1/3] Verificando tipos (npm run lint)..." -ForegroundColor Green
npm run lint
if ($LASTEXITCODE -ne 0) { throw "Falha no 'npm run lint' (exit code $LASTEXITCODE)" }

# 2. Define tags e compila imagem Docker (o build do app roda dentro do Dockerfile)
if ($Release) {
    Write-Host "`n[2/3] Compilando e publicando imagem de PRODUCAO..." -ForegroundColor Green
    $TAGS = @("${IMAGE}:zapzap-latest", "${IMAGE}:zapzap-$VERSION")
    $DEPLOY_URL = [System.Environment]::GetEnvironmentVariable("DEPLOY_PROD_URL")
} else {
    Write-Host "`n[2/3] Compilando e publicando imagem de DESENVOLVIMENTO (dev)..." -ForegroundColor Green
    $TAGS = @("${IMAGE}:zapzap-dev")
    $DEPLOY_URL = [System.Environment]::GetEnvironmentVariable("DEPLOY_DEV_URL")
}

$tagArgs = $TAGS | ForEach-Object { @("-t", $_) }
docker build @tagArgs -f ./Dockerfile .
if ($LASTEXITCODE -ne 0) { throw "Falha no docker build (exit code $LASTEXITCODE)" }
foreach ($t in $TAGS) {
    docker push $t
    if ($LASTEXITCODE -ne 0) { throw "Falha no docker push para $t (exit code $LASTEXITCODE)" }
}

# 3. Dispara Webhook de deploy se solicitado
if ($Deploy) {
    Write-Host "`n[3/3] Disparando Webhook de Deploy..." -ForegroundColor Green
    if ($DEPLOY_URL) {
        try {
            Invoke-RestMethod -Uri $DEPLOY_URL -Method Post -TimeoutSec 30 | Out-Null
            Write-Host "Deploy disparado com sucesso!" -ForegroundColor Green
        } catch {
            Write-Warning "Falha ao acionar webhook de deploy: $_"
        }
    } else {
        Write-Warning "Nenhuma URL de deploy configurada no .env (DEPLOY_PROD_URL ou DEPLOY_DEV_URL)."
    }
} else {
    Write-Host "`n[3/3] Etapa de deploy pulada. Use -Deploy para acionar o webhook automaticamente." -ForegroundColor DarkGray
}

Write-Host "`nConcluido com sucesso!" -ForegroundColor Cyan
