# Optional asset preparation only. Checked-in runtime PNGs deploy without this tool.
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot), [switch]$Unregistered, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'portrait-registration.ps1')
$portraitRoot = Join-Path (Resolve-Path -LiteralPath $RepositoryRoot) 'assets/portraits/dogfight'
$outputRoot = if ($OutputDirectory) { $OutputDirectory } else { Join-Path $portraitRoot 'runtime' }
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$poses = @('neutral', 'ah', 'oo', 'blink', 'smile', 'angry', 'afraid')
$anchors = @(@(187,322,245), @(181,322,239), @(176,323,243), @(179,310,216), @(183,263,186), @(185,269,188), @(181,259,166), @(185,270,190))
$images = @{}
$sources = @{}
$outputs = @{}
try {
    foreach ($pose in $poses) {
        $path = Join-Path $portraitRoot "$pose.png"
        $images[$pose] = [System.Drawing.Bitmap]::new($path)
        $sources["$pose.png"] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    for ($index = 0; $index -lt 8; $index++) {
        $packed = [System.Drawing.Bitmap]::new(1792, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($packed)
        try {
            $graphics.Clear([System.Drawing.Color]::FromArgb(11,17,21))
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $anchor = $anchors[$index]
            $scale = (.61 - .44) * 256 / ($anchor[1] - $anchor[2])
            $left = .48 * 256 - $anchor[0] * $scale
            $top = .61 * 256 - $anchor[1] * $scale
            for ($frame = 0; $frame -lt $poses.Length; $frame++) {
                $image = $images[$poses[$frame]]
                # Clip each cell: normalized portraits can extend past its edges.
                $graphics.SetClip([System.Drawing.Rectangle]::new($frame * 256, 0, 256, 256))
                $destination = [System.Drawing.RectangleF]::new($frame * 256 + $left, $top, 362 * $scale, 543 * $scale)
                $source = [System.Drawing.RectangleF]::new(($index % 4) * $image.Width / 4, [Math]::Floor($index / 4) * $image.Height / 2, $image.Width / 4, $image.Height / 2)
                $graphics.DrawImage($image, $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)
            }
            $path = Join-Path $outputRoot "portrait-$index.png"
            $registered = Register-Portrait $packed "dogfight/$index"
            try { $registered.Save($path, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $registered.Dispose() }
            $outputs["portrait-$index.png"] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        } finally { $graphics.Dispose(); $packed.Dispose() }
    }
    # New cast sources contain one character in a 4x2 expression sheet.
    # Anchors are measured in each sheet's 362x543 source cell: x, mouth, eyes.
    $newCast = @(
        @('viper',180,297,208), @('wraith',181,310,227),
        @('razor',181,296,213), @('hex',183,310,223),
        @('talon',181,290,202), @('knell',182,300,216),
        @('cinder',181,306,219), @('shade',181,304,222),
        @('control',181,305,218)
    )
    for ($character = 0; $character -lt $newCast.Length; $character++) {
        $spec = $newCast[$character]
        $name = "cast/$($spec[0]).png"
        $path = Join-Path $portraitRoot $name
        $sheet = [System.Drawing.Bitmap]::new($path)
        $sources[$name] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $packed = [System.Drawing.Bitmap]::new(1792,256,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($packed)
        try {
            $graphics.Clear([System.Drawing.Color]::FromArgb(11,17,21))
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $scale = .17 * 256 / ($spec[2] - $spec[3])
            $left = .48 * 256 - $spec[1] * $scale
            $top = .61 * 256 - $spec[2] * $scale
            for ($frame=0; $frame -lt 7; $frame++) {
                $graphics.SetClip([System.Drawing.Rectangle]::new($frame*256,0,256,256))
                $destination = [System.Drawing.RectangleF]::new($frame*256+$left,$top,362*$scale,543*$scale)
                $source = [System.Drawing.RectangleF]::new(($frame%4)*$sheet.Width/4,[Math]::Floor($frame/4)*$sheet.Height/2,$sheet.Width/4,$sheet.Height/2)
                $graphics.DrawImage($sheet,$destination,$source,[System.Drawing.GraphicsUnit]::Pixel)
            }
            $outputName = "portrait-$($character+8).png"
            $path = Join-Path $outputRoot $outputName
            $registered = Register-Portrait $packed "dogfight/$($character+8)"
            try { $registered.Save($path,[System.Drawing.Imaging.ImageFormat]::Png) } finally { $registered.Dispose() }
            $outputs[$outputName] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        } finally { $graphics.Dispose(); $packed.Dispose(); $sheet.Dispose() }
    }
    $builderHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [ordered]@{version=1;registrationApplied=(!$Unregistered);registrationSha256=$registrationHash;registrationHelperSha256=$registrationHelperHash;tileSize=256;frames=$poses;anchors=$anchors;newCast=$newCast;builderSha256=$builderHash;sources=$sources;outputs=$outputs} |
        ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $outputRoot 'manifest.json')
} finally { foreach ($image in $images.Values) { $image.Dispose() } }
Get-ChildItem -LiteralPath $outputRoot -Filter '*.png' | Measure-Object -Property Length -Sum | Select-Object Count,Sum
