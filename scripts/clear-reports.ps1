param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("CLEAR_ALL_REPORTS")]
  [string]$Confirmation
)

$secretFile = Join-Path $PSScriptRoot "..\.env.clear-reports.local"
if (-not (Test-Path -LiteralPath $secretFile)) {
  throw "Missing .env.clear-reports.local. Pull or restore the webhook secret first."
}

$secretLine = Get-Content -LiteralPath $secretFile | Where-Object { $_ -like "CLEAR_REPORTS_SECRET=*" } | Select-Object -First 1
if (-not $secretLine) { throw "CLEAR_REPORTS_SECRET is missing from .env.clear-reports.local." }
$secret = $secretLine.Substring("CLEAR_REPORTS_SECRET=".Length).Trim('"')

$headers = @{ Authorization = "Bearer $secret" }
$body = @{ confirmation = $Confirmation } | ConvertTo-Json
Invoke-RestMethod -Uri "https://civic-pulse-bwmi.vercel.app/api/admin/clear-reports" -Method Post -Headers $headers -ContentType "application/json" -Body $body
