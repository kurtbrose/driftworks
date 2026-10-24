# Offline-only per-frame source registration. Never infer approval from a fit.
$registrationPath = Join-Path $RepositoryRoot 'assets/portraits/registration.json'
$registration = Get-Content -Raw -LiteralPath $registrationPath | ConvertFrom-Json
$registrationHash = (Get-FileHash -LiteralPath $registrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
$registrationHelperHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (!$Unregistered) { foreach ($poolEntry in $registration.sources.PSObject.Properties) {
    foreach ($sourceEntry in $poolEntry.Value.PSObject.Properties) {
        $sourcePath = Join-Path $RepositoryRoot ('assets/portraits/' + $poolEntry.Name + '/' + $sourceEntry.Name)
        if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceEntry.Value) {
            throw "Registration is stale for $sourcePath. Re-measure and visually review the changed source."
        }
    }
} }
function Register-Portrait([System.Drawing.Bitmap]$Atlas, [string]$Key) {
    if ($Unregistered) { return ,$Atlas.Clone() }
    $entry = $registration.characters.$Key
    if (!$entry -or $entry.offsets.Count -ne 7) { throw "Missing seven-frame registration for $Key" }
    $result = [System.Drawing.Bitmap]::new(1792,256,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($result)
    try {
        $g.Clear([System.Drawing.Color]::FromArgb(11,17,21))
        for ($frame=0;$frame -lt 7;$frame++) {
            $offset = $entry.offsets[$frame]
            if ($offset.Count -ne 2 -or [Math]::Abs($offset[0]) -gt 12 -or [Math]::Abs($offset[1]) -gt 12) { throw "Invalid registration for $Key / $frame" }
            $g.SetClip([System.Drawing.Rectangle]::new($frame*256,0,256,256))
            # Integer source registration preserves the packed facial pixels.
            $g.DrawImage($Atlas,[System.Drawing.Rectangle]::new($frame*256+$offset[0],$offset[1],256,256),[System.Drawing.Rectangle]::new($frame*256,0,256,256),[System.Drawing.GraphicsUnit]::Pixel)
        }
    } finally { $g.Dispose() }
    return ,$result
}
