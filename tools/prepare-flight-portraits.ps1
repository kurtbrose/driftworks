# Optional asset preparation only. Checked-in runtime PNGs deploy without this tool.
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$portraitRoot = Join-Path (Resolve-Path -LiteralPath $RepositoryRoot) 'assets/portraits/dogfight'
$outputRoot = Join-Path $portraitRoot 'runtime'
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
            $packed.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
            $outputs["portrait-$index.png"] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        } finally { $graphics.Dispose(); $packed.Dispose() }
    }
    $builderHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [ordered]@{version=1;tileSize=256;frames=$poses;anchors=$anchors;builderSha256=$builderHash;sources=$sources;outputs=$outputs} |
        ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $outputRoot 'manifest.json')
} finally { foreach ($image in $images.Values) { $image.Dispose() } }
Get-ChildItem -LiteralPath $outputRoot -Filter '*.png' | Measure-Object -Property Length -Sum | Select-Object Count,Sum
