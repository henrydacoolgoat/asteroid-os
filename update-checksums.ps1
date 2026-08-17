$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
$normalizedTextExtensions = @('.html', '.js', '.mjs', '.md', '.txt')
$browserDirectory = Join-Path $projectDirectory 'asteroid-browser'
$browserOutputPath = Join-Path $browserDirectory 'SHA256SUMS.txt'

function Get-DeterministicSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  $extension = [System.IO.Path]::GetExtension($RelativePath).ToLowerInvariant()
  if ($normalizedTextExtensions -contains $extension) {
    $text = [System.IO.File]::ReadAllText($FilePath)
    $normalizedText = $text.Replace("`r`n", "`n").Replace("`r", "`n")
    $bytes = $utf8WithoutBom.GetBytes($normalizedText)
  } else {
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  }

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

if (Test-Path -LiteralPath $browserDirectory) {
  $browserLines = Get-ChildItem -LiteralPath $browserDirectory -Recurse -File |
    Where-Object { $_.FullName -ne $browserOutputPath } |
    Sort-Object FullName |
    ForEach-Object {
      $relativePath = [System.IO.Path]::GetRelativePath($browserDirectory, $_.FullName).Replace('\', '/')
      $hash = Get-DeterministicSha256 -FilePath $_.FullName -RelativePath $relativePath
      "$hash  $relativePath"
    }

  $browserText = if ($browserLines.Count) { [string]::Join("`n", $browserLines) + "`n" } else { '' }
  [System.IO.File]::WriteAllText($browserOutputPath, $browserText, $utf8WithoutBom)
}

$outputPath = Join-Path $projectDirectory 'SHA256SUMS.txt'
$lines = Get-ChildItem -LiteralPath $projectDirectory -Recurse -File |
  Where-Object { $_.FullName -ne $outputPath } |
  Sort-Object FullName |
  ForEach-Object {
    $relativePath = [System.IO.Path]::GetRelativePath($projectDirectory, $_.FullName).Replace('\', '/')
    $hash = Get-DeterministicSha256 -FilePath $_.FullName -RelativePath $relativePath
    "$hash  $relativePath"
  }

$outputText = if ($lines.Count) { [string]::Join("`n", $lines) + "`n" } else { '' }
[System.IO.File]::WriteAllText($outputPath, $outputText, $utf8WithoutBom)
Write-Output "Updated $outputPath"
