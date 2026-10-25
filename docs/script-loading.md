# Script loading

The development-time source of shared script lists is
`tools/script-manifest.cjs`. It contains ordered groups and named profiles.
Groups collect dependencies commonly loaded together; profiles compose those
groups and declare context-specific additions or omissions. Required load-time
boundaries are checked before a profile can be used. Unknown groups, cycles,
duplicate scripts and invalid paths fail immediately.

The manifest does not run in the browser. The site still deploys as ordinary
static files, with relative script URLs and vendored libraries. Serving a fresh
checkout requires no generation, package installation or runtime fetch of the
manifest.

## Consumers

| Profile | Consumer |
| --- | --- |
| `tactical` | Generated script tags in `rts.html` |
| `flight` | Generated script tags and import map in `experiments/flight.html` |
| `sharedTests` | `tests/helpers/shared-runtime.cjs`; loads the runtime and shared harness for Node groups |
| `browserTests` | Generated tags in `tests/index.html`; derives from `sharedTests` with viewer resources |
| `headless` | `tools/headless.cjs`; excludes the Pixi game and browser resources |
| `scenarios` | `tests/scenarios.cjs` |
| `threeTests`, `asteroidTests` | Renderer submission, texture-prewarming and asteroid bridge test loaders |
| `studyWorker` | Generated dependency array in `experiments/flight-study-worker.js` |

Other standalone labs keep their own small script lists. Move them to a profile
when sharing their dependencies becomes useful. The manifest does not claim to
describe every script loaded anywhere in the repository.

## Changing a dependency

1. Edit the shared group or relevant profile in `tools/script-manifest.cjs`.
   Add a required load-time boundary to `dependencies` when a script captures
   another module during initialization.
2. Run `npm run refresh:assets`. It updates the marked script blocks, the worker
   array, and asset versions. Commit the generated files with the manifest.
3. Run focused checks for the affected consumers, then `npm run check`.

Do not manually edit inside `script-manifest` comment markers. Inline page setup
and the asset-version helper remain outside the generated HTML block. Module
scripts and the flight import map are explicit profile entries. Node and classic
worker loaders reject profiles containing either.

`npm run check:scripts` checks every declared script exists, checks profile order,
and rejects stale generated blocks or extra external scripts outside those
blocks. It does not write files. `node tests/script-manifest.cjs` covers invalid
definitions, browser/Node parity, relative URLs, module attributes, worker paths,
asset-version compatibility and repeatable generation.

The study worker still fetches each local dependency once, hashes the fetched
source, and executes that same source in order. Generation changes the source
of its list, not its cache or replay policy.
