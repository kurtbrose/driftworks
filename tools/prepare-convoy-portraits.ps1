# Optional offline preparation. All runtime PNGs are checked in; no deployment build.
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingReferences = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.PointF].Assembly.Location)
# Newer bundled .NET runtimes forward Bitmap's native image interface here.
foreach ($assembly in @('System.Private.Windows.GdiPlus','System.Private.Windows.Core')) {
    try { $drawingReferences += [System.Reflection.Assembly]::Load($assembly).Location } catch { }
}
Add-Type -ReferencedAssemblies $drawingReferences -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class ConvoyPortraitPacker {
    // The renderer's existing permission polygon; clothing never owns these pixels.
    static readonly PointF[] face = new PointF[] {
        new PointF(49,29),new PointF(57,29),new PointF(62,33),new PointF(66,38),
        new PointF(66,47),new PointF(64,54),new PointF(60,62),new PointF(56,69),
        new PointF(49,73),new PointF(43,70),new PointF(37,63),new PointF(34,54),
        new PointF(30.5f,48),new PointF(30.5f,40),new PointF(33,37),new PointF(44,36)
    };
    static double Weight(int x, int y) {
        double px=x/2.56,py=y/2.56,min=100; bool inside=false;
        for(int i=0,j=face.Length-1;i<face.Length;j=i++) {
            var a=face[j];var b=face[i];
            if((a.Y>py)!=(b.Y>py) && px<(b.X-a.X)*(py-a.Y)/(b.Y-a.Y)+a.X) inside=!inside;
            double dx=b.X-a.X,dy=b.Y-a.Y;
            double t=Math.Max(0,Math.Min(1,((px-a.X)*dx+(py-a.Y)*dy)/(dx*dx+dy*dy)));
            min=Math.Min(min,Math.Sqrt(Math.Pow(px-a.X-t*dx,2)+Math.Pow(py-a.Y-t*dy,2)));
        }
        return inside?1:Math.Max(0,1-min*2.56/5);
    }
    public static void Pack(string originalPath, string wardrobePath, string outputPath) {
        using(var original=new Bitmap(originalPath))
        using(var wardrobe=new Bitmap(wardrobePath))
        using(var master=new Bitmap(256,256,PixelFormat.Format32bppArgb))
        using(var packed=new Bitmap(1792,256,PixelFormat.Format32bppArgb)) {
            using(var g=Graphics.FromImage(master)) {
                g.InterpolationMode=InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode=PixelOffsetMode.Half;
                g.DrawImage(wardrobe,new Rectangle(0,0,256,256));
            }
            for(int y=0;y<256;y++) for(int x=0;x<256;x++) {
                double weight=Weight(x,y);var cloth=master.GetPixel(x,y);
                for(int frame=0;frame<7;frame++) {
                    var old=original.GetPixel(frame*256+x,y);
                    var color=weight>=1?old:weight<=0?cloth:Color.FromArgb(255,
                        (int)Math.Round(old.R*weight+cloth.R*(1-weight)),
                        (int)Math.Round(old.G*weight+cloth.G*(1-weight)),
                        (int)Math.Round(old.B*weight+cloth.B*(1-weight)));
                    packed.SetPixel(frame*256+x,y,color);
                }
            }
            packed.Save(outputPath,ImageFormat.Png);
        }
    }
}
'@
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$artRoot = Join-Path $root 'assets/portraits/convoy'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $artRoot 'prompts.json') | ConvertFrom-Json
$outputs = @{}
$sources = @{}
$generated = @{}
$runtime = Join-Path $artRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'output/convoy-cast') | Out-Null
$preview = [System.Drawing.Bitmap]::new(1024,512)
$previewGraphics = [System.Drawing.Graphics]::FromImage($preview)
try {
    $previewGraphics.Clear([System.Drawing.Color]::FromArgb(11,17,21))
    $previewIndex = 0
    foreach ($job in $manifest.jobs) {
        $index = $job.index
        $source = Join-Path $root $job.source
        $wardrobe = Join-Path $artRoot "source/$($job.id).png"
        $output = Join-Path $runtime "portrait-$index.png"
        [ConvoyPortraitPacker]::Pack($source,$wardrobe,$output)
        $sources["portrait-$index.png"] = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        $generated["portrait-$index.png"] = (Get-FileHash -LiteralPath $wardrobe -Algorithm SHA256).Hash.ToLowerInvariant()
        $outputs["portrait-$index.png"] = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
        $image = [System.Drawing.Bitmap]::new($output)
        try {
            $cell = [System.Drawing.Rectangle]::new(($previewIndex%4)*256,[Math]::Floor($previewIndex/4)*256,256,256)
            $previewGraphics.DrawImage($image,$cell,[System.Drawing.Rectangle]::new(0,0,256,256),[System.Drawing.GraphicsUnit]::Pixel)
        } finally { $image.Dispose() }
        $previewIndex++
        Write-Host "Packed $($job.name) ($index)"
    }
    $preview.Save((Join-Path $root 'output/convoy-cast/cast-preview.png'),[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $previewGraphics.Dispose(); $preview.Dispose() }
[ordered]@{version=1;tileSize=256;frames=@('neutral','ah','oo','blink','smile','angry','afraid');
    builderSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();
    sources=$sources;generated=$generated;outputs=$outputs} |
    ConvertTo-Json -Depth 5 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $runtime 'manifest.json'), ($_ -replace "`r`n", "`n") + "`n", [System.Text.UTF8Encoding]::new($false)) }
