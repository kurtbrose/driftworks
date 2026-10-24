# Offline packing only; the checked-in PNGs need no runtime dependencies.
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
      [ValidateSet('civilian-shuttle','runway-workers')][string]$Pool = 'civilian-shuttle', [switch]$Unregistered, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'portrait-registration.ps1')
$root = Join-Path $RepositoryRoot ('assets/portraits/' + $Pool)
$indexField = if ($Pool -eq 'runway-workers') { 'runwayPortraitIndex' } else { 'civilianPortraitIndex' }
$runtime = if ($OutputDirectory) { $OutputDirectory } else { Join-Path $root 'runtime' }
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$roster = Get-Content -Raw -LiteralPath (Join-Path $root 'roster.json') | ConvertFrom-Json
$outputs = [ordered]@{}
$sources = [ordered]@{}
# Measured neutral-cell anchors (fractions): face center X, eye Y, mouth Y.
$anchors = @(@(.50,.381,.580),@(.49,.350,.542),@(.507,.415,.632),@(.50,.377,.580),@(.50,.413,.609),@(.49,.374,.564))
if ($Pool -eq 'runway-workers') { $anchors = @(@(.50,.386,.580),@(.50,.374,.564),@(.50,.383,.580),@(.50,.370,.553),@(.50,.383,.580),@(.50,.380,.580)) }
foreach ($person in $roster.characters) {
    $name = 'source/' + $person.id + '-sheet.png'
    $sheet = [System.Drawing.Bitmap]::new((Join-Path $root $name))
    $sources[$name] = (Get-FileHash -LiteralPath (Join-Path $root $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    $packed = [System.Drawing.Bitmap]::new(1792,256,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($packed)
    try {
        $graphics.Clear([System.Drawing.Color]::FromArgb(11,17,21))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $anchor = $anchors[$person.$indexField]
        $scale = .17 / ($anchor[2] - $anchor[1])
        $left = (.48 - $anchor[0] * $scale) * 256
        $top = (.44 - $anchor[1] * $scale) * 256
        for ($frame=0; $frame -lt 7; $frame++) {
            $graphics.SetClip([System.Drawing.Rectangle]::new($frame*256,0,256,256))
            $destination = [System.Drawing.RectangleF]::new($frame*256+$left,$top,256*$scale,256*$scale)
            $source = [System.Drawing.RectangleF]::new(($frame%4)*$sheet.Width/4,[Math]::Floor($frame/4)*$sheet.Height/2,$sheet.Width/4,$sheet.Height/2)
            $graphics.DrawImage($sheet,$destination,$source,[System.Drawing.GraphicsUnit]::Pixel)
        }
        $output = 'portrait-' + $person.$indexField + '.png'
        $registered = Register-Portrait $packed "$Pool/$($person.$indexField)"
        try { $registered.Save((Join-Path $runtime $output),[System.Drawing.Imaging.ImageFormat]::Png) } finally { $registered.Dispose() }
        $outputs[$output] = (Get-FileHash -LiteralPath (Join-Path $runtime $output) -Algorithm SHA256).Hash.ToLowerInvariant()
    } finally { $graphics.Dispose(); $packed.Dispose(); $sheet.Dispose() }
}
$manifest = [ordered]@{version=1;registrationApplied=(!$Unregistered);registrationSha256=$registrationHash;registrationHelperSha256=$registrationHelperHash;tileSize=256;frames=@('neutral','ah','oo','blink','smile','angry','afraid');anchors=$anchors;builderSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();sources=$sources;outputs=$outputs}
$json = ($manifest | ConvertTo-Json -Depth 6).Replace("`r`n","`n") + "`n"
[System.IO.File]::WriteAllText((Join-Path $runtime 'manifest.json'),$json,[System.Text.UTF8Encoding]::new($false))
