$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$messageXPath = Join-Path $projectDirectory 'messagex-v0.99.4.html'
$loaderPath = Join-Path $projectDirectory 'MessageX_Latest_Loader_APP_VERSION_SIGNIN_FIXED.html'
$indexPath = Join-Path $projectDirectory 'index.html'
$utf8 = [System.Text.UTF8Encoding]::new($false)

$messageX = [System.IO.File]::ReadAllText($messageXPath, $utf8)
[System.IO.File]::WriteAllText($loaderPath, $messageX, $utf8)

$index = [System.IO.File]::ReadAllText($indexPath, $utf8)
$startMarker = '<script id="messageXEmbeddedSource" type="text/plain">'
$startIndex = $index.IndexOf($startMarker, [System.StringComparison]::Ordinal)
if ($startIndex -lt 0) { throw 'The external MessageX marker was not found.' }
$contentStart = $startIndex + $startMarker.Length

$boundary = $index.IndexOf("</html>`n</script>", $contentStart, [System.StringComparison]::OrdinalIgnoreCase)
if ($boundary -ge 0) {
  # Migrate old single-file builds by removing the nested HTML document. Pages
  # now loads the canonical same-origin MessageX file in its own iframe.
  $index = $index.Substring(0, $contentStart) + 'messagex-v0.99.4.html' + $index.Substring($boundary + 7)
} else {
  $markerEnd = $index.IndexOf('</script>', $contentStart, [System.StringComparison]::OrdinalIgnoreCase)
  if ($markerEnd -lt 0) { throw 'The external MessageX marker end was not found.' }
  $index = $index.Substring(0, $contentStart) + 'messagex-v0.99.4.html' + $index.Substring($markerEnd)
}

$previousBuilds = @(
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-laptop-storage-asteroid-bundled-2026-08-05';",
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-laptop-storage-chat-members-asteroid-bundled-2026-08-05';",
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-permanent-gateway-asteroid-bundled-2026-08-06';",
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-resilient-permanent-gateway-asteroid-bundled-2026-08-06';"
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-post-ticket-resilient-permanent-gateway-asteroid-bundled-2026-08-06';"
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-desktop-columns-permanent-gateway-asteroid-bundled-2026-08-09';"
  "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-permanent-gateway-media-recovery-2026-08-12';"
)
$newBuild = "const MESSAGE_X_BUNDLED_BUILD='messagex-v0994-supabase-offline-media-queue-2026-08-12';"
foreach ($previousBuild in $previousBuilds) {
  if ($index.Contains($previousBuild)) {
    $index = $index.Replace($previousBuild, $newBuild)
  }
}
if (-not $index.Contains($newBuild)) {
  throw 'The Asteroid OS MessageX build marker was not found.'
}

[System.IO.File]::WriteAllText($indexPath, $index, $utf8)

Write-Output 'Synchronized the standalone and loader MessageX builds and externalized the OS client.'
