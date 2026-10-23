# scripts/deploy.ps1 - check, then deploy Synapse to AWS (ECR + ECS Fargate + RDS).
#
# Usage (from Windows PowerShell, in the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -SkipChecks      # deploy only
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -SkipMigrations  # no prisma migrate deploy
#
# Docker and the AWS CLI must be on the Windows side (Docker Desktop running, aws configure done).
# The app checks run inside WSL, where Node 22 lives.

param(
  # Publishable keys are public by design (they ship in the browser bundle), so this is safe here.
  [string]$PublishableKey = "pk_live_Y2xlcmsua2V2aW4tZGFuaWVsLnRlY2gk",
  [switch]$SkipChecks,
  [switch]$SkipMigrations
)

# NOTE: intentionally not "Stop" - we check native exit codes ourselves, and PS 5.1 turns
# native stderr into ErrorRecords that would abort the script on Stop.
$ErrorActionPreference = "Continue"

# ---------------------------------------------------------------- config
$Region    = "us-east-1"
$AccountId = "761595200926"
$Cluster   = "synapse"
$Service   = "synapse-service"
$TaskDef   = "synapse-task"
$Image     = "$AccountId.dkr.ecr.$Region.amazonaws.com/synapse:latest"
$SiteUrl   = "https://synapse.kevin-daniel.tech"
$WslRepo   = "/home/kevindaniel/resume/synapse"
$NodeBin   = "/home/kevindaniel/.nvm/versions/node/v22.22.2/bin"
$NodePath  = "${NodeBin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
$Subnets   = "subnet-042ed460a6c8e1e0e,subnet-0df243a54ac9616de"
$AppSg     = "sg-07178998a60164bec"

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Fail($m) { Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }
function Ok($m)   { Write-Host "ok: $m" -ForegroundColor Green }

# Run a command inside WSL with Node 22 on PATH and the repo as cwd.
# PATH is set explicitly (never referencing $PATH) so no host PATH leaks in.
function Wsl-Cmd([string]$cmd) {
  wsl bash -c "export PATH=$NodePath; cd $WslRepo; $cmd"
}

# ---------------------------------------------------------------- checks
if (-not $SkipChecks) {
  Step "typecheck (tsc --noEmit)"
  Wsl-Cmd "env -u NODE_ENV npx tsc --noEmit"
  if ($LASTEXITCODE -ne 0) { Fail "typecheck reported errors" }
  Ok "types"

  Step "test suite (vitest)"
  Wsl-Cmd "env -u NODE_ENV npm test"
  if ($LASTEXITCODE -ne 0) { Fail "tests failed" }
  Ok "tests"

  Step "lint (advisory - does not block the deploy)"
  Wsl-Cmd "env -u NODE_ENV npm run lint"
}

# ---------------------------------------------------------------- build + push
Set-Location '\\wsl.localhost\Ubuntu\home\kevindaniel\resume\synapse'

Step "docker build"
$buildLog = Join-Path $env:TEMP "synapse-build.log"
docker build --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$PublishableKey" -t synapse . *>&1 | Out-File -FilePath $buildLog -Encoding utf8
Get-Content $buildLog -Tail 4
if ($LASTEXITCODE -ne 0) { Fail "docker build - see $buildLog" }
Ok "image built"

Step "push to ECR"
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "ecr login" }
docker tag synapse $Image
$pushLog = Join-Path $env:TEMP "synapse-push.log"
docker push $Image *>&1 | Out-File -FilePath $pushLog -Encoding utf8
Get-Content $pushLog -Tail 2
if ($LASTEXITCODE -ne 0) { Fail "docker push - see $pushLog" }
Ok "pushed $Image"

# ---------------------------------------------------------------- migrations
if (-not $SkipMigrations) {
  Step "prisma migrate deploy (one-off ECS task)"
  $overrides = Join-Path $env:TEMP "synapse-migrate.json"
  Set-Content -Path $overrides -Value '{"containerOverrides":[{"name":"app","command":["npx","prisma","migrate","deploy"]}]}' -Encoding ASCII
  $net = "awsvpcConfiguration={subnets=[$Subnets],securityGroups=[$AppSg],assignPublicIp=ENABLED}"
  $taskArn = aws ecs run-task --cluster $Cluster --task-definition $TaskDef --launch-type FARGATE `
    --network-configuration $net --overrides "file://$overrides" --region $Region `
    --query 'tasks[0].taskArn' --output text
  if (-not $taskArn -or $taskArn -eq "None" -or $LASTEXITCODE -ne 0) { Fail "could not start the migration task" }
  aws ecs wait tasks-stopped --cluster $Cluster --tasks $taskArn --region $Region
  $exit = aws ecs describe-tasks --cluster $Cluster --tasks $taskArn --region $Region `
    --query 'tasks[0].containers[0].exitCode' --output text
  if ($exit -ne "0") { Fail "migrations exited $exit (see CloudWatch /ecs/synapse)" }
  Ok "migrations applied"
}

# ---------------------------------------------------------------- roll out
Step "force ECS deployment"
aws ecs update-service --cluster $Cluster --service $Service --force-new-deployment --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "update-service" }
aws ecs wait services-stable --cluster $Cluster --services $Service --region $Region
Ok "service stable"

# ---------------------------------------------------------------- verify
Step "verify $SiteUrl"
$healthy = $false
for ($i = 1; $i -le 10; $i++) {
  try {
    $r = Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing -TimeoutSec 30
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { }
  Start-Sleep -Seconds 10
}
if (-not $healthy) { Fail "$SiteUrl did not return 200 (check target health + CloudWatch /ecs/synapse)" }

Write-Host "`nDEPLOYED: $SiteUrl" -ForegroundColor Green
exit 0
