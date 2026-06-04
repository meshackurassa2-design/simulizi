$path = "C:\Users\Admin\.gemini\antigravity-ide\scratch\simulizi-app"
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    $urlPath = $request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = "index.html" }
    
    $filePath = Join-Path $path $urlPath
    
    if (Test-Path $filePath -PathType Leaf) {
        $buffer = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $buffer.Length
        
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        if ($ext -eq ".html") { $response.ContentType = "text/html" }
        elseif ($ext -eq ".css") { $response.ContentType = "text/css" }
        elseif ($ext -eq ".js") { $response.ContentType = "application/javascript" }
        
        try {
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } catch {}
    } else {
        $response.StatusCode = 404
    }
    $response.Close()
}
