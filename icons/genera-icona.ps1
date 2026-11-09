param([string]$Variant = 'tramonto', [int]$Size = 512, [string]$Out, [switch]$Maskable)
Add-Type -AssemblyName System.Drawing
$S = $Size
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$g.Clear([System.Drawing.Color]::Transparent)
function C($hex, $a = 255) { $c = [System.Drawing.ColorTranslator]::FromHtml($hex); [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B) }
function PT($x, $y) { New-Object System.Drawing.PointF ([float]($x * $S)), ([float]($y * $S)) }
function Grad($x1, $y1, $x2, $y2, $c1, $c2) { New-Object System.Drawing.Drawing2D.LinearGradientBrush (PT $x1 $y1), (PT $x2 $y2), $c1, $c2 }
function Poly($brush, $pts) { $g.FillPolygon($brush, [System.Drawing.PointF[]]$pts) }

# Forma di base: quadrato arrotondato (o pieno per maskable)
$clip = New-Object System.Drawing.Drawing2D.GraphicsPath
if ($Maskable) { $clip.AddRectangle((New-Object System.Drawing.RectangleF 0, 0, $S, $S)) }
else {
  $r = $S * 0.225; $d = 2 * $r
  $clip.AddArc(0, 0, $d, $d, 180, 90); $clip.AddArc($S - $d, 0, $d, $d, 270, 90)
  $clip.AddArc($S - $d, $S - $d, $d, $d, 0, 90); $clip.AddArc(0, $S - $d, $d, $d, 90, 90); $clip.CloseFigure()
}
$g.SetClip($clip)

# Per la maskable il disegno resta nella zona sicura (80% centrale): scala attorno al centro
if ($Maskable) { $g.TranslateTransform($S * 0.5, $S * 0.5); $g.ScaleTransform(1.0, 1.0); $g.TranslateTransform(-$S * 0.5, -$S * 0.5) }

switch ($Variant) {
  'tramonto' {
    $g.FillRectangle((Grad 0 0 0 1 (C '#1a1838') (C '#ff7a3d')), 0, 0, $S, $S)
    # alone e sole
    $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glow.AddEllipse([float]($S*0.18), [float]($S*0.28), [float]($S*0.64), [float]($S*0.64))
    $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
    $pg.CenterColor = C '#ffd27a' 150; $pg.SurroundColors = [System.Drawing.Color[]]@((C '#ff7a3d' 0))
    $g.FillPath($pg, $glow)
    $g.FillEllipse((Grad 0 0.38 0 0.62 (C '#fff1c4') (C '#ffb347')), [float]($S*0.38), [float]($S*0.36), [float]($S*0.24), [float]($S*0.24))
    # catena lontana
    Poly (Grad 0 0.45 0 1 (C '#7b3f6e') (C '#4a2a55')) @((PT (-0.05) 1), (PT (-0.05) 0.70), (PT 0.14 0.55), (PT 0.26 0.64), (PT 0.42 0.47), (PT 0.58 0.62), (PT 0.74 0.50), (PT 0.90 0.61), (PT 1.05 0.53), (PT 1.05 1))
    # montagna principale
    Poly (Grad 0 0.25 0 1 (C '#3b2a5c') (C '#16142b')) @((PT (-0.05) 1), (PT 0.20 0.66), (PT 0.33 0.70), (PT 0.55 0.28), (PT 0.70 0.52), (PT 0.80 0.47), (PT 1.05 0.80), (PT 1.05 1))
    # versante in luce
    Poly (Grad 0 0.28 0 1 (C '#ff9a52' 235) (C '#b2406e' 120)) @((PT 0.55 0.28), (PT 0.50 0.46), (PT 0.54 0.56), (PT 0.45 0.78), (PT 0.42 1.05), (PT (-0.05) 1.05), (PT (-0.05) 1), (PT 0.20 0.66), (PT 0.33 0.70))
    # neve
    Poly (New-Object System.Drawing.SolidBrush (C '#fff6ee')) @((PT 0.55 0.28), (PT 0.615 0.40), (PT 0.585 0.385), (PT 0.555 0.43), (PT 0.525 0.39), (PT 0.49 0.41))
  }
  'notte' {
    $g.FillRectangle((Grad 0 0 0 1 (C '#0b1430') (C '#243b6b')), 0, 0, $S, $S)
    $star = New-Object System.Drawing.SolidBrush (C '#ffffff' 210)
    foreach ($p in @(@(0.15,0.15,0.012),@(0.30,0.09,0.008),@(0.82,0.12,0.01),@(0.70,0.24,0.007),@(0.12,0.36,0.008),@(0.45,0.14,0.006),@(0.90,0.34,0.007))) {
      $g.FillEllipse($star, [float]($p[0]*$S), [float]($p[1]*$S), [float]($p[2]*$S*2), [float]($p[2]*$S*2)) }
    $g.FillEllipse((New-Object System.Drawing.SolidBrush (C '#ffe9b0')), [float]($S*0.66), [float]($S*0.14), [float]($S*0.16), [float]($S*0.16))
    $g.FillEllipse((Grad 0 0 0 1 (C '#0f1a3a') (C '#1d3060')), [float]($S*0.70), [float]($S*0.12), [float]($S*0.15), [float]($S*0.15))
    Poly (Grad 0 0.4 0 1 (C '#35538f') (C '#1a2a50')) @((PT (-0.05) 1), (PT (-0.05) 0.68), (PT 0.18 0.50), (PT 0.34 0.64), (PT 0.62 0.40), (PT 0.82 0.58), (PT 1.05 0.48), (PT 1.05 1))
    Poly (Grad 0 0.3 0 1 (C '#ff9f43') (C '#d9582b')) @((PT 0.02 1), (PT 0.44 0.30), (PT 0.62 0.58), (PT 0.70 0.52), (PT 0.98 1))
    Poly (Grad 0.2 0.5 0.5 1 (C '#7a2d1a' 140) (C '#7a2d1a' 0)) @((PT 0.44 0.30), (PT 0.40 0.55), (PT 0.47 0.62), (PT 0.38 1), (PT 0.02 1))
    Poly (New-Object System.Drawing.SolidBrush (C '#fff6ee')) @((PT 0.44 0.30), (PT 0.515 0.42), (PT 0.48 0.405), (PT 0.445 0.45), (PT 0.41 0.405), (PT 0.375 0.42))
  }
  'vetta' {
    $g.FillRectangle((Grad 0 0 1 1 (C '#202833') (C '#0e1012')), 0, 0, $S, $S)
    Poly (New-Object System.Drawing.SolidBrush (C '#2c3440')) @((PT 0.45 0.88), (PT 0.72 0.42), (PT 1.0 0.88))
    Poly (Grad 0 0.2 0 0.9 (C '#ffb066') (C '#f07a2a')) @((PT 0.08 0.88), (PT 0.44 0.24), (PT 0.80 0.88))
    Poly (New-Object System.Drawing.SolidBrush (C '#c85a1c' 150)) @((PT 0.44 0.24), (PT 0.38 0.50), (PT 0.44 0.58), (PT 0.34 0.88), (PT 0.08 0.88))
    Poly (New-Object System.Drawing.SolidBrush (C '#fff6ee')) @((PT 0.44 0.24), (PT 0.53 0.40), (PT 0.49 0.38), (PT 0.445 0.43), (PT 0.40 0.38), (PT 0.35 0.40))
    # bandierina sulla vetta
    $pen = New-Object System.Drawing.Pen (C '#f3f4f5'), ([float]($S * 0.014))
    $g.DrawLine($pen, (PT 0.44 0.245), (PT 0.44 0.10))
    Poly (New-Object System.Drawing.SolidBrush (C '#2fd17a')) @((PT 0.447 0.10), (PT 0.57 0.135), (PT 0.447 0.17))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush (C '#3a434f')), [float]($S*0.08), [float]($S*0.875), [float]($S*0.84), [float]($S*0.012))
  }
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
