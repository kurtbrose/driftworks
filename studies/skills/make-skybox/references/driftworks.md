# Driftworks integration

Resolve these paths from the Driftworks repository root, not this installed skill.
Read current source and AGENTS.md because the factory is still evolving.

- `docs/skybox-authoring.md`: current projection, composition, blending, lighting
  and export rules.
- `assets/backgrounds/features/`: original reusable galaxy, nebula, filament and
  warm sun; `prompts.json` records generation provenance.
- `assets/backgrounds/skybox-factory/suns/`: generated sun variants and prompts.
- `experiments/skybox-factory.html` and `.js`: library and optical/animation bench.
  Frame export creates a clean black-backed sprite. This bench by itself is not
  evidence that a composition editor or six-camera exporter has been built.
- `assets/backgrounds/hero-layout-v1.json`: existing library/placement recipe.
  Its current helpers isolate families and reject duplicate/overlapping features;
  inspect these constraints before adding mixed compositions.
- `experiments/skybox.js`: tangent-plane sprite rendering and existing sky modes.
- `tools/compose-skybox.py`: offline directional compositor, currently exporting
  a 2:1 equirectangular image plus a sibling `.layout.json`. It is not currently
  a six-camera cubemap capture CLI. Python Pillow and NumPy are authoring-only
  dependencies; check availability before use.
- `tools/bake-sky-lighting.py`: precomputed environment lighting. Rebuild relevant
  caches only when an integrated sky's sources change.
- `experiments/skybox-review.html`: existing rotating sky/foreground art review.

Current recipe angles use yaw 90 along +Y and pitch 90 along +Z. Preserve this
Z-up convention or explicitly convert at the export boundary; do not assume a
Y-up engine's cube camera orientations will work without conversion.

Keep the static deployment model: relative local URLs, no build step or new
runtime network dependencies. Use the existing vendored renderer if implementing
capture. Follow the repository's focused tests and browser verification guidance;
refresh asset versions with `node tools/refresh-site-assets.cjs` when applicable.
Documentation/skill-only work requires diff review rather than the full game suite.
