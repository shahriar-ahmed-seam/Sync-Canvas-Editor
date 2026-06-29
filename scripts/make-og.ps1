Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path "assets\hero.jpg"))

$ogW = 1200; $ogH = 630
$targetRatio = $ogW / $ogH

# center-crop the source to the OG aspect ratio
$srcRatio = $src.Width / $src.Height
if ($srcRatio -gt $targetRatio) {
  $cropH = $src.Height
  $cropW = [int]($src.Height * $targetRatio)
} else {
  $cropW = $src.Width
  $cropH = [int]($src.Width / $targetRatio)
}
$cropX = [int](($src.Width - $cropW) / 2)
$cropY = [int](($src.Height - $cropH) / 2)

$bmp = New-Object System.Drawing.Bitmap $ogW, $ogH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = "HighQualityBicubic"
$g.PixelOffsetMode = "HighQuality"
$srcRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $cropW, $cropH
$dstRect = New-Object System.Drawing.Rectangle 0, 0, $ogW, $ogH
$g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

# warm scrim + wordmark so the OG card is branded, not just a photo
$scrim = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point 0,0),
  (New-Object System.Drawing.Point $ogW,0),
  ([System.Drawing.Color]::FromArgb(235,18,16,11)),
  ([System.Drawing.Color]::FromArgb(40,18,16,11)))
$g.FillRectangle($scrim, $dstRect)

$accent = [System.Drawing.Color]::FromArgb(255,198,145,12)
$g.FillRectangle((New-Object System.Drawing.SolidBrush $accent), 64, 96, 36, 36)

$cream = [System.Drawing.Color]::FromArgb(255,244,239,227)
$f1 = New-Object System.Drawing.Font("Segoe UI Semibold", 64, [System.Drawing.FontStyle]::Bold)
$f2 = New-Object System.Drawing.Font("Segoe UI", 26)
$g.DrawString("Sync-Canvas", $f1, (New-Object System.Drawing.SolidBrush $cream), 60, 150)
$g.DrawString("Real-time collaborative whiteboard. Conflict-free, built on CRDTs.",
  $f2, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,200,190,170))), 64, 250)

$g.Dispose()
$bmp.Save((Join-Path (Get-Location) "apps\web\public\og.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose(); $src.Dispose()
Write-Output "wrote apps/web/public/og.jpg (1200x630)"
