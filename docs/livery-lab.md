# Procedural hull livery lab

Open `experiments/livery-lab.html` through the local static server. The experiments
index links to it. No packages, build, textures, or network services are required.

The default scene places fifteen examples on a shared hangar deck with the existing
flight skybox. Orbit and zoom around the collection; one grammar and palette apply
to every hull. Toggle the skybox for a plain background. The Scene selector returns
to the hangar after a close-up; choosing a test subject opens Solo inspection.

Select a hull and switch between raw greybox and six surface grammars. Three
independent paint colors, pattern density, apparent relief, weathering and seed
are shared across subjects. Split view compares the same geometry and camera with
raw shading on the left and treatment on the right. Turntable, orbit, zoom and
top/side presets support inspection. New assembly generates another deterministic
collection of overlapping blocks; it does not change the pattern seed.

Cube, sphere and cylinder are calibration subjects. The fixed Barracuda Aâ€“E and
fleet fixtures in `livery-fixtures.js` capture the existing greybox studies at their
default dimensions. They are intentionally independent of ongoing edits in those
benches. Placeholder craft follow the current scene renderer's two-block layout;
the mothership uses the actual shared habitat and hardware generators. Display
copies are centered and fitted independently, with their original extent shown in
meters; these are not fleet relative-scale comparisons.

`livery-lab.js` accepts position/normal batches in meters. Normalization preserves
the source arrays and normals. The fragment shader blends three projections in
hull space, so shapes need no UVs. Each grammar defines panel frequency, masks,
paint distribution and a height signal. Height derivatives perturb lighting;
they do **not** extrude geometry, alter silhouettes or supply collision geometry.
Dark machinery and cockpit batches stay protected from the panel treatment.
Calibration and raw greybox deliberately use neutral shading for other surfaces.

This first bench tests surface languages, rather than finished ship construction.
It does not yet infer semantic armor zones, merge overlapping solids, cut real
recesses, or generate physically overlapping armor plates. Add those as geometry
passes separately from the hull generator when the visual language is settled.
