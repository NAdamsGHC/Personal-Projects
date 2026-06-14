<#
  Tiny static file server for previewing the dashboard locally.
  (Opening index.html as a file:// URL won't work because the browser blocks
  the fetch() of the JSON data files. Serving over http fixes that.)

  Usage:  pwsh ./scripts/serve.ps1            # then open http://localhost:8123/
          pwsh ./scripts/serve.ps1 -Port 9000
#>
param([int]$Port = 8123)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot   # the worldcup-2026 folder
$rootFull = [System.IO.Path]::GetFullPath($root)

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $rootFull at http://localhost:$Port/  (Ctrl+C to stop)"

while ($listener.IsListening) {
  try {
    $ctx  = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $file = Join-Path $rootFull ($path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    $full = [System.IO.Path]::GetFullPath($file)
    if (-not $full.StartsWith($rootFull)) { $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue }

    if (Test-Path $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
