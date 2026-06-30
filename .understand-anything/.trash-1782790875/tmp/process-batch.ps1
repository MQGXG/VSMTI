param(
    [int]$BatchIndex,
    [string]$ProjectRoot = "D:\开发\VSMTI",
    [string]$SkillDir = "C:\Users\Devenv114\.agents\skills\understand"
)

$batchesPath = "$ProjectRoot\.understand-anything\intermediate\batches.json"
$batches = Get-Content $batchesPath | ConvertFrom-Json

$batch = $batches.batches | Where-Object { $_.batchIndex -eq $BatchIndex }
if (-not $batch) {
    Write-Error "Batch $BatchIndex not found"
    exit 1
}

$inputFile = "$ProjectRoot\.understand-anything\tmp\ua-file-analyzer-input-$BatchIndex.json"
$outputFile = "$ProjectRoot\.understand-anything\intermediate\batch-$BatchIndex.json"
$extractOutput = "$ProjectRoot\.understand-anything\tmp\ua-file-extract-results-$BatchIndex.json"

# Build input JSON
$inputObj = @{
    projectRoot = $ProjectRoot
    batchFiles = $batch.files
    batchImportData = $batch.batchImportData
}
$inputObj | ConvertTo-Json -Depth 10 | Set-Content $inputFile -Encoding UTF8

# Run extract-structure.mjs
node "$SkillDir\extract-structure.mjs" $inputFile $extractOutput 2>&1

if (-not (Test-Path $extractOutput)) {
    Write-Error "Extraction failed for batch $BatchIndex"
    exit 1
}

Write-Output "Batch $BatchIndex extraction complete"
