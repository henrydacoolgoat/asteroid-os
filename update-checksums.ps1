$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputPath = Join-Path $projectDirectory 'SHA256SUMS.txt'
$lines = Get-ChildItem -LiteralPath $projectDirectory -Recurse -File |
  Where-Object { $_.FullName -ne $outputPath } |
  Sort-Object FullName |
  ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $relativePath = [System.IO.Path]::GetRelativePath($projectDirectory, $_.FullName).Replace('\\', '/')
    "$hash  $relativePath"
  }

[System.IO.File]::WriteAllLines($outputPath, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Updated $outputPath"
