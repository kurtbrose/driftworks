# Night sky image credits

These locally served background images are unmodified screen-sized JPEG versions from the
[European Southern Observatory image archive](https://www.eso.org/public/images/). ESO distributes
these images under the [Creative Commons Attribution 4.0 International license](https://creativecommons.org/licenses/by/4.0/).

| Local file | ESO source | Image credit |
| --- | --- | --- |
| `all-sky-milky-way.jpg` | [The Milky Way panorama](https://www.eso.org/public/images/eso0932a/) | ESO/S. Brunier |
| `coalsack-wide-field.jpg` | [Wide-field view of part of the Coalsack Nebula](https://www.eso.org/public/images/eso1539c/) | ESO/Digitized Sky Survey 2. Acknowledgment: Davide De Martin |
| `deep-field.jpg` | [Unveiling distant stars and galaxies](https://www.eso.org/public/images/potw1339a/) | ESO |

The in-game low- and very-low-exposure choices are contrast treatments of
`all-sky-milky-way.jpg`, rather than separate photographs.

The full credit for the active image is also shown in the in-game developer settings.

## Authored hero sky

`features/` contains three generated source images (galaxy, nebula and sun),
with exact prompts and provenance in `features/prompts.json`. These were created
using the built-in image generation tool. They are separate from the ESO images
above and do not inherit the ESO credits.

`hero-layout-v1.json` places unique source features on a sphere, separated into galaxy, nebula and sun families.
`hero-composition-v1-8k.jpg` is an 8192 × 4096 galaxy-family reference bake of that layout;
the runtime uses the original feature textures for greater local detail.
See [sky authoring](../../docs/skybox-authoring.md) for the deterministic helper,
export commands, compositing rules and resolution tradeoffs.
