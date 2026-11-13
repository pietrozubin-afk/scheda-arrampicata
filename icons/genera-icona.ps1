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
  'alba' {
    # cielo chiaro azzurro -> pesca, sole giallo, montagne a strati colorati
    $g.FillRectangle((Grad 0 0 0 1 (C '#8fd3ff') (C '#ffe0c2')), 0, 0, $S, $S)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush (C '#fff3a8' 170)), [float]($S*0.58), [float]($S*0.10), [float]($S*0.30), [float]($S*0.30))
    $g.FillEllipse((Grad 0 0.13 0 0.37 (C '#ffe45c') (C '#ffb52e')), [float]($S*0.62), [float]($S*0.14), [float]($S*0.22), [float]($S*0.22))
    # nuvoletta
    $cloud = New-Object System.Drawing.SolidBrush (C '#ffffff' 235)
    $g.FillEllipse($cloud, [float]($S*0.10), [float]($S*0.20), [float]($S*0.16), [float]($S*0.09))
    $g.FillEllipse($cloud, [float]($S*0.17), [float]($S*0.16), [float]($S*0.14), [float]($S*0.11))
    $g.FillEllipse($cloud, [float]($S*0.25), [float]($S*0.21), [float]($S*0.12), [float]($S*0.08))
    # catena lontana viola chiaro
    Poly (New-Object System.Drawing.SolidBrush (C '#b9a3f0')) @((PT (-0.05) 1), (PT (-0.05) 0.62), (PT 0.16 0.46), (PT 0.30 0.58), (PT 0.62 0.40), (PT 0.82 0.56), (PT 1.05 0.44), (PT 1.05 1))
    # montagna principale corallo con versante in ombra
    Poly (Grad 0 0.25 0 1 (C '#ff8a65') (C '#ff5d73')) @((PT 0.0 1), (PT 0.44 0.27), (PT 0.62 0.56), (PT 0.70 0.50), (PT 1.0 1))
    Poly (New-Object System.Drawing.SolidBrush (C '#e0445e' 150)) @((PT 0.44 0.27), (PT 0.62 0.56), (PT 0.70 0.50), (PT 1.0 1), (PT 0.55 1), (PT 0.50 0.62), (PT 0.53 0.52))
    # neve
    Poly (New-Object System.Drawing.SolidBrush (C '#ffffff')) @((PT 0.44 0.27), (PT 0.515 0.39), (PT 0.48 0.375), (PT 0.445 0.42), (PT 0.41 0.375), (PT 0.37 0.39))
    # colline verdi in primo piano
    $g.FillEllipse((Grad 0 0.78 0 1 (C '#5fd38a') (C '#2fae6a')), [float]($S*(-0.25)), [float]($S*0.80), [float]($S*0.85), [float]($S*0.50))
    $g.FillEllipse((Grad 0 0.80 0 1 (C '#7be0a0') (C '#3cbf78')), [float]($S*0.45), [float]($S*0.84), [float]($S*0.85), [float]($S*0.50))
  }
  'pastello' {
    # sfondo crema, tre picchi pieni di colore che si sovrappongono
    $g.FillRectangle((Grad 0 0 0 1 (C '#fff8ec') (C '#ffeccc')), 0, 0, $S, $S)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush (C '#ffc94a')), [float]($S*0.16), [float]($S*0.14), [float]($S*0.22), [float]($S*0.22))
    Poly (New-Object System.Drawing.SolidBrush (C '#4fc3c7')) @((PT 0.38 0.86), (PT 0.68 0.36), (PT 0.98 0.86))
    Poly (New-Object System.Drawing.SolidBrush (C '#3aa9ad')) @((PT 0.68 0.36), (PT 0.98 0.86), (PT 0.80 0.86), (PT 0.72 0.55))
    Poly (New-Object System.Drawing.SolidBrush (C '#ff7b6b')) @((PT 0.04 0.86), (PT 0.40 0.26), (PT 0.76 0.86))
    Poly (New-Object System.Drawing.SolidBrush (C '#e85f55')) @((PT 0.40 0.26), (PT 0.76 0.86), (PT 0.55 0.86), (PT 0.46 0.50))
    Poly (New-Object System.Drawing.SolidBrush (C '#ffffff')) @((PT 0.40 0.26), (PT 0.485 0.40), (PT 0.45 0.385), (PT 0.405 0.43), (PT 0.365 0.385), (PT 0.315 0.40))
    Poly (New-Object System.Drawing.SolidBrush (C '#ffffff')) @((PT 0.68 0.36), (PT 0.745 0.47), (PT 0.715 0.455), (PT 0.685 0.49), (PT 0.655 0.455), (PT 0.615 0.47))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush (C '#8bd17c')), [float]0, [float]($S*0.86), [float]$S, [float]($S*0.20))
  }
  'geo-prese' {
    # quattro prese geometriche colorate su fondo chiaro (cerchio, triangolo, esagono, quadrato)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush (C '#f6f3ee')), 0, 0, $S, $S)
    $shadow = New-Object System.Drawing.SolidBrush (C '#2a2340' 40)
    $o = 0.018
    # cerchio corallo (alto sinistra)
    $g.FillEllipse($shadow, [float](0.13+$o)*$S, [float](0.13+$o)*$S, [float]0.34*$S, [float]0.34*$S)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush (C '#ff5d73')), [float]0.13*$S, [float]0.13*$S, [float]0.34*$S, [float]0.34*$S)
    # triangolo giallo (alto destra)
    $tri = @((PT 0.71 0.13), (PT 0.89 0.46), (PT 0.53 0.46))
    Poly $shadow @((PT (0.71+$o) (0.13+$o)), (PT (0.89+$o) (0.46+$o)), (PT (0.53+$o) (0.46+$o)))
    Poly (New-Object System.Drawing.SolidBrush (C '#ffc531')) $tri
    # esagono blu (basso sinistra)
    $hex = 0..5 | ForEach-Object { $a = [Math]::PI / 3 * $_ + [Math]::PI / 6; PT (0.30 + 0.175 * [Math]::Cos($a)) (0.71 + 0.175 * [Math]::Sin($a)) }
    $hexS = 0..5 | ForEach-Object { $a = [Math]::PI / 3 * $_ + [Math]::PI / 6; PT (0.30 + $o + 0.175 * [Math]::Cos($a)) (0.71 + $o + 0.175 * [Math]::Sin($a)) }
    Poly $shadow $hexS
    Poly (New-Object System.Drawing.SolidBrush (C '#4f7cff')) $hex
    # quadrato arrotondato verde (basso destra)
    $rr = { param($x, $y, $w, $r) $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $x*=$S; $y*=$S; $w*=$S; $d=2*$r*$S
      $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x+$w-$d, $y, $d, $d, 270, 90); $p.AddArc($x+$w-$d, $y+$w-$d, $d, $d, 0, 90); $p.AddArc($x, $y+$w-$d, $d, $d, 90, 90); $p.CloseFigure(); $p }
    $g.FillPath($shadow, (& $rr (0.55+$o) (0.55+$o) 0.32 0.07))
    $g.FillPath((New-Object System.Drawing.SolidBrush (C '#2fd17a')), (& $rr 0.55 0.55 0.32 0.07))
    # foro della vite al centro di ogni presa
    $hole = New-Object System.Drawing.SolidBrush (C '#ffffff' 220)
    foreach ($c in @(@(0.30,0.30),@(0.71,0.36),@(0.30,0.71),@(0.71,0.71))) {
      $g.FillEllipse($hole, [float]($c[0]-0.028)*$S, [float]($c[1]-0.028)*$S, [float]0.056*$S, [float]0.056*$S) }
  }
  'geo-moschettone' {
    # moschettone geometrico a gradiente su fondo chiaro
    $g.FillRectangle((Grad 0 0 1 1 (C '#fff4e0') (C '#ffe1ec')), 0, 0, $S, $S)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x = 0.30*$S; $y = 0.14*$S; $w = 0.40*$S; $h = 0.72*$S; $r = 0.20*$S
    $path.AddArc($x, $y, 2*$r, 2*$r, 180, 180)
    $path.AddArc($x, $y + $h - 2*$r, 2*$r, 2*$r, 0, 180)
    $path.CloseFigure()
    $grad = Grad 0 0.05 0 0.95 (C '#ff7a3d') (C '#e83e8c')
    $grad.WrapMode = 'TileFlipXY'
    $pen = New-Object System.Drawing.Pen $grad, ([float]($S*0.08))
    # corpo con un'apertura sul lato destro, dove sta la leva
    $gapTop = $y + 0.20*$S; $gapBot = $y + 0.46*$S
    $g.ExcludeClip((New-Object System.Drawing.Rectangle ([int]($x + $w - 0.07*$S)), ([int]$gapTop), ([int](0.14*$S)), ([int]($gapBot - $gapTop))))
    $g.DrawPath($pen, $path)
    $g.SetClip($clip)
    # leva: barra blu che chiude l'apertura in diagonale
    $gate = New-Object System.Drawing.Pen (C '#4f7cff'), ([float]($S*0.06))
    $gate.StartCap = 'Round'; $gate.EndCap = 'Round'
    $g.DrawLine($gate, [float]($x + $w), [float]($gapTop - 0.01*$S), [float]($x + $w - 0.07*$S), [float]($gapBot + 0.01*$S))
    # ghiera gialla in basso a destra
    $ring = New-Object System.Drawing.Pen (C '#ffc531'), ([float]($S*0.11))
    $ring.StartCap = 'Round'; $ring.EndCap = 'Round'
    $g.DrawLine($ring, [float]($x + $w), [float]($y + 0.55*$S), [float]($x + $w), [float]($y + 0.60*$S))
  }
  'geo-bauhaus' {
    # griglia 2x2 stile Bauhaus: quarti di cerchio, semicerchi e triangoli
    $cols = @{ a = (C '#ff5d73'); b = (C '#ffc531'); c = (C '#4f7cff'); d = (C '#2fd17a'); bg = (C '#fbf7f0') }
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $cols.bg), 0, 0, $S, $S)
    $h = $S / 2
    # alto sinistra: quarto di cerchio corallo
    $g.FillPie((New-Object System.Drawing.SolidBrush $cols.a), [float]0, [float]0, [float]$S, [float]$S, 180, 90)
    # alto destra: fondo blu + cerchio giallo
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $cols.c), [float]$h, [float]0, [float]$h, [float]$h)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $cols.b), [float]($h + $S*0.09), [float]($S*0.09), [float]($S*0.32), [float]($S*0.32))
    # basso sinistra: triangolo verde
    Poly (New-Object System.Drawing.SolidBrush $cols.d) @((PT 0 0.5), (PT 0.5 1), (PT 0 1))
    # basso destra: semicerchio corallo su fondo giallo
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $cols.b), [float]$h, [float]$h, [float]$h, [float]$h)
    $g.FillPie((New-Object System.Drawing.SolidBrush $cols.a), [float]$h, [float]($h + $S*0.25), [float]$h, [float]$h, 180, 180)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $cols.bg), [float]($S*0.42), [float]($S*0.42), [float]($S*0.16), [float]($S*0.16))
  }
  'prese' {
    # montagna-parete con prese colorate: il richiamo all'arrampicata indoor
    $g.FillRectangle((Grad 0 0 1 1 (C '#e9f6ff') (C '#cfe9ff')), 0, 0, $S, $S)
    Poly (Grad 0 0.15 0 1 (C '#5b8def') (C '#3a5fd0')) @((PT 0.02 0.92), (PT 0.50 0.14), (PT 0.98 0.92))
    Poly (New-Object System.Drawing.SolidBrush (C '#2f4fb8' 140)) @((PT 0.50 0.14), (PT 0.98 0.92), (PT 0.66 0.92), (PT 0.58 0.50))
    Poly (New-Object System.Drawing.SolidBrush (C '#ffffff')) @((PT 0.50 0.14), (PT 0.595 0.29), (PT 0.555 0.275), (PT 0.505 0.33), (PT 0.455 0.275), (PT 0.405 0.29))
    $holds = @(@(0.40,0.52,'#ff5d73'),@(0.55,0.44,'#ffc531'),@(0.47,0.64,'#3ddc84'),@(0.62,0.62,'#ff8a3d'),@(0.33,0.76,'#b07cff'),@(0.53,0.79,'#ff5d73'),@(0.70,0.80,'#ffc531'))
    foreach ($h in $holds) {
      $r = 0.045
      $g.FillEllipse((New-Object System.Drawing.SolidBrush (C '#1f2f6b' 90)), [float](($h[0]-$r+0.008)*$S), [float](($h[1]-$r+0.012)*$S), [float](2*$r*$S), [float](2*$r*$S))
      $g.FillEllipse((New-Object System.Drawing.SolidBrush (C $h[2])), [float](($h[0]-$r)*$S), [float](($h[1]-$r)*$S), [float](2*$r*$S), [float](2*$r*$S))
      $g.FillEllipse((New-Object System.Drawing.SolidBrush (C '#ffffff' 110)), [float](($h[0]-$r*0.55)*$S), [float](($h[1]-$r*0.6)*$S), [float]($r*0.7*$S), [float]($r*0.55*$S))
    }
    $g.FillRectangle((New-Object System.Drawing.SolidBrush (C '#ff9f43')), [float]0, [float]($S*0.92), [float]$S, [float]($S*0.10))
  }
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
