Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path "assets\hero.jpg"))

# Downscale to a small bitmap for fast, representative sampling.
$w = 160
$h = [int]($src.Height / $src.Width * $w)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = "HighQualityBicubic"
$g.DrawImage($src, 0, 0, $w, $h)

$buckets = @{}      # coarse color -> count
$satBest = $null    # most saturated reasonably-bright pixel (accent candidate)
$satBestScore = -1
$rSum = 0; $gSum = 0; $bSum = 0; $n = 0
$lumSum = 0

for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $p = $bmp.GetPixel($x, $y)
    $rSum += $p.R; $gSum += $p.G; $bSum += $p.B; $n++
    $lum = 0.2126 * $p.R + 0.7152 * $p.G + 0.0722 * $p.B
    $lumSum += $lum

    # coarse quantize to 32-steps for dominant-color histogram
    $qr = [int]($p.R / 32) * 32
    $qg = [int]($p.G / 32) * 32
    $qb = [int]($p.B / 32) * 32
    $key = "$qr,$qg,$qb"
    if ($buckets.ContainsKey($key)) { $buckets[$key]++ } else { $buckets[$key] = 1 }

    # accent candidate: high saturation, mid/high brightness
    $max = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
    $min = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
    if ($max -gt 0) {
      $sat = ($max - $min) / $max
      $score = $sat * ($max / 255.0)
      if ($sat -gt 0.45 -and $max -gt 90 -and $score -gt $satBestScore) {
        $satBestScore = $score
        $satBest = $p
      }
    }
  }
}

$avg = "avg rgb = {0},{1},{2}" -f [int]($rSum/$n), [int]($gSum/$n), [int]($bSum/$n)
$meanLum = [int]($lumSum / $n)
Write-Output $avg
Write-Output "mean luminance = $meanLum (0=black,255=white)"

Write-Output "`nTop dominant colors:"
$buckets.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object {
  $pct = [math]::Round($_.Value * 100.0 / $n, 1)
  Write-Output ("  rgb({0})  {1}%" -f $_.Key, $pct)
}

if ($satBest) {
  Write-Output ("`nAccent candidate (most vivid): rgb({0},{1},{2})  #{0:X2}{1:X2}{2:X2}" -f $satBest.R, $satBest.G, $satBest.B)
} else {
  Write-Output "`nNo strongly saturated accent found (image is muted)."
}

$g.Dispose(); $bmp.Dispose(); $src.Dispose()
