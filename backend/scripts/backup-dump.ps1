param(
  [string]$Container = $(if ($env:POSTGRES_DOCKER_CONTAINER) { $env:POSTGRES_DOCKER_CONTAINER } else { 'local-postgres-bap' }),
  [string]$OutputDirectory = $(Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'

docker inspect $Container *> $null
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL container '$Container' is not running."
}

$timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ssZ')
$fileName = "bap-inventory-$timestamp.dump"
$containerFile = "/tmp/$fileName"
$outputDirectoryPath = [IO.Path]::GetFullPath($OutputDirectory)
$outputFile = Join-Path $outputDirectoryPath $fileName

try {
  docker exec -e "DUMP_PATH=$containerFile" $Container sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump --format=custom --compress=9 --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file "$DUMP_PATH"'
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }

  docker exec -e "DUMP_PATH=$containerFile" $Container sh -c 'pg_restore --list "$DUMP_PATH" >/dev/null'
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not read the dump archive.' }

  New-Item -ItemType Directory -Force -Path $outputDirectoryPath | Out-Null
  docker cp "${Container}:${containerFile}" $outputFile
  if ($LASTEXITCODE -ne 0) { throw 'docker cp failed.' }

  $file = Get-Item -LiteralPath $outputFile
  if ($file.Length -eq 0) { throw 'The dump archive is empty.' }

  Write-Host "PostgreSQL dump created: $($file.FullName)"
  Write-Host "Size: $($file.Length) bytes; format: pg_dump custom"
}
finally {
  docker exec -e "DUMP_PATH=$containerFile" $Container sh -c 'rm -f -- "$DUMP_PATH"' *> $null
}
