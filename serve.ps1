# Server statico minimo per provare l'app sul PC (http://localhost:8080).
# Uso:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
param([int]$Port = 8080)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Server avviato su http://localhost:$Port/ (Ctrl+C per fermare)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    # Un errore su una singola richiesta non deve fermare il server
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
      # Nessuna cache, così durante lo sviluppo si vede sempre l'ultima versione
      $res.Headers.Add('Cache-Control', 'no-store')
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        if ($ctx.Request.HttpMethod -eq 'HEAD') {
          $res.ContentLength64 = $bytes.Length
        } else {
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-Host "Errore su $($ctx.Request.Url): $_"
    } finally {
      try { $res.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
