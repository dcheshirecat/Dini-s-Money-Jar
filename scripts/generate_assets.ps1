Add-Type -AssemblyName System.Drawing

function Fill-RoundedRect {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Drawing.Brush]$Brush,
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $Graphics.FillPath($Brush, $path)
    $path.Dispose()
}

function New-CuteJarImage {
    param(
        [string]$Path,
        [int]$Size,
        [bool]$Transparent = $false,
        [bool]$Monochrome = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    if ($Transparent) {
        $graphics.Clear([System.Drawing.Color]::Transparent)
    } else {
        $bg1 = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 245, 245, 245) } else { [System.Drawing.Color]::FromArgb(255, 255, 237, 169) }
        $bg2 = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 220, 220, 220) } else { [System.Drawing.Color]::FromArgb(255, 255, 144, 191) }
        $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size),
            $bg1,
            $bg2,
            45
        )
        $graphics.FillRectangle($bgBrush, 0, 0, $Size, $Size)
        $bgBrush.Dispose()
    }

    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 20, 7, 45))
    $graphics.FillEllipse($shadowBrush, [int]($Size * 0.24), [int]($Size * 0.81), [int]($Size * 0.52), [int]($Size * 0.08))
    $shadowBrush.Dispose()

    $lidColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 60, 60, 60) } else { [System.Drawing.Color]::FromArgb(255, 255, 93, 143) }
    $jarFillColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 90, 90, 90) } else { [System.Drawing.Color]::FromArgb(255, 127, 231, 163) }
    $jarFillTopColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 135, 135, 135) } else { [System.Drawing.Color]::FromArgb(255, 170, 255, 194) }
    $jarGlassColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(160, 40, 40, 40) } else { [System.Drawing.Color]::FromArgb(145, 213, 244, 255) }
    $jarOutlineColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 35, 35, 35) } else { [System.Drawing.Color]::FromArgb(255, 255, 255, 255) }
    $billColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 120, 120, 120) } else { [System.Drawing.Color]::FromArgb(255, 215, 255, 215) }
    $billOutlineColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 60, 60, 60) } else { [System.Drawing.Color]::FromArgb(255, 97, 178, 107) }
    $billTextColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 250, 250, 250) } else { [System.Drawing.Color]::FromArgb(255, 44, 122, 59) }
    $coinColor = if ($Monochrome) { [System.Drawing.Color]::FromArgb(255, 85, 85, 85) } else { [System.Drawing.Color]::FromArgb(255, 255, 209, 102) }

    $lidBrush = New-Object System.Drawing.SolidBrush $lidColor
    $graphics.FillEllipse($lidBrush, [int]($Size * 0.33), [int]($Size * 0.16), [int]($Size * 0.34), [int]($Size * 0.11))
    $graphics.FillEllipse($lidBrush, [int]($Size * 0.36), [int]($Size * 0.22), [int]($Size * 0.28), [int]($Size * 0.07))
    $lidBrush.Dispose()

    $jarPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $jarRect = New-Object System.Drawing.Rectangle ([int]($Size * 0.25)), ([int]($Size * 0.24)), ([int]($Size * 0.5)), ([int]($Size * 0.55))
    $radius = [int]($Size * 0.09)
    $diameter = $radius * 2
    $jarPath.AddArc($jarRect.X, $jarRect.Y, $diameter, $diameter, 180, 90)
    $jarPath.AddArc($jarRect.Right - $diameter, $jarRect.Y, $diameter, $diameter, 270, 90)
    $jarPath.AddArc($jarRect.Right - $diameter, $jarRect.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $jarPath.AddArc($jarRect.X, $jarRect.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $jarPath.CloseFigure()

    $jarBrush = New-Object System.Drawing.SolidBrush $jarGlassColor
    $jarPen = New-Object System.Drawing.Pen $jarOutlineColor, ($Size * 0.015)
    $graphics.FillPath($jarBrush, $jarPath)
    $graphics.DrawPath($jarPen, $jarPath)

    $fillRect = New-Object System.Drawing.Rectangle ([int]($Size * 0.29)), ([int]($Size * 0.43)), ([int]($Size * 0.42)), ([int]($Size * 0.3))
    $fillBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($fillRect, $jarFillTopColor, $jarFillColor, 90)
    $graphics.FillPie($fillBrush, $fillRect.X, $fillRect.Y, $fillRect.Width, $fillRect.Height, 0, 180)
    $graphics.FillRectangle($fillBrush, $fillRect.X, $fillRect.Y + [int]($fillRect.Height / 2), $fillRect.Width, [int]($fillRect.Height / 2))
    $fillBrush.Dispose()

    $billBrush = New-Object System.Drawing.SolidBrush $billColor
    $billPen = New-Object System.Drawing.Pen $billOutlineColor, ($Size * 0.006)
    $billTextBrush = New-Object System.Drawing.SolidBrush $billTextColor
    $billFont = New-Object System.Drawing.Font 'Arial', ($Size * 0.05), ([System.Drawing.FontStyle]::Bold)
    $billRects = @(
        (New-Object System.Drawing.RectangleF ($Size * 0.34), ($Size * 0.5), ($Size * 0.12), ($Size * 0.065)),
        (New-Object System.Drawing.RectangleF ($Size * 0.48), ($Size * 0.47), ($Size * 0.12), ($Size * 0.065)),
        (New-Object System.Drawing.RectangleF ($Size * 0.41), ($Size * 0.57), ($Size * 0.12), ($Size * 0.065))
    )
    foreach ($rect in $billRects) {
        $graphics.FillRectangle($billBrush, $rect.X, $rect.Y, $rect.Width, $rect.Height)
        $graphics.DrawRectangle($billPen, $rect.X, $rect.Y, $rect.Width, $rect.Height)
        $graphics.DrawString('$', $billFont, $billTextBrush, $rect.X + ($rect.Width * 0.34), $rect.Y + ($rect.Height * 0.08))
    }
    $billBrush.Dispose()
    $billPen.Dispose()
    $billTextBrush.Dispose()
    $billFont.Dispose()

    $coinBrush = New-Object System.Drawing.SolidBrush $coinColor
    foreach ($coin in @(
        (New-Object System.Drawing.RectangleF ($Size * 0.36), ($Size * 0.64), ($Size * 0.05), ($Size * 0.05)),
        (New-Object System.Drawing.RectangleF ($Size * 0.57), ($Size * 0.62), ($Size * 0.045), ($Size * 0.045)),
        (New-Object System.Drawing.RectangleF ($Size * 0.49), ($Size * 0.67), ($Size * 0.04), ($Size * 0.04))
    )) {
        $graphics.FillEllipse($coinBrush, $coin)
    }
    $coinBrush.Dispose()

    $highlightBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
    Fill-RoundedRect -Graphics $graphics -Brush $highlightBrush -X ($Size * 0.31) -Y ($Size * 0.31) -Width ($Size * 0.035) -Height ($Size * 0.28) -Radius ($Size * 0.018)
    $highlightBrush.Dispose()

    $jarBrush.Dispose()
    $jarPen.Dispose()
    $jarPath.Dispose()
    $graphics.Dispose()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
New-CuteJarImage -Path (Join-Path $root 'assets/icon.png') -Size 1024
New-CuteJarImage -Path (Join-Path $root 'assets/splash-icon.png') -Size 1024 -Transparent $true
New-CuteJarImage -Path (Join-Path $root 'assets/android-icon-foreground.png') -Size 432 -Transparent $true
New-CuteJarImage -Path (Join-Path $root 'assets/android-icon-monochrome.png') -Size 432 -Transparent $true -Monochrome $true
