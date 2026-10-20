# Speech sprite experiment

Serve the repository and open `experiments/speech-sprites/`. This standalone demo
uses the user-supplied contact sheet unchanged, with explicit source rectangles.
It does not change game behavior or require any network resources.

Regression coverage: `node tests/speech-sprites.cjs` (also in `npm run check`).

Select any of five crew members, edit the transmission, and press Transmit.
The existing local Mumble synthesizer supplies voices, with a default preset per
crew member and an override selector. Choose radio or clean playback and a pace.
Mouth frames and subtitles use the AudioContext clock and Mumble syllable events,
including the radio lead-in; mouths close between voiced bursts. Idle portraits
blink. This is approximate vowel animation rather than full phoneme lip sync.
Stop, character changes, and leaving the page cancel playback. Reduced motion
uses a still portrait and honors the browser preference by default.

The active source is the user's second supplied sheet, `crew-sheet-v2.png`.
Its columns are neutral, four mouth openings, blink, happy, angry, scared and
somber. The demo uses neutral/mouth/blink frames; the expression columns remain
available for later experiments. Crops are explicit because spacing is still
slightly irregular. Whole-frame swapping caused visible jumping. The renderer now always draws the
neutral head and shoulders, then overlays small mouth/eyelid patches at a fixed
position. It preserves the source aspect ratio. Source images are not edited. The first source is preserved as
`crew-sheet.png` for comparison. Both source images are unmodified.

## Master portrait and soft-edge audition

Open `generated-v1/` for the next approach: a generated neutral master followed
by a mouth-only edit of that exact image. The page compares raw full-image
switching with a fixed master plus an elliptical feathered mouth overlay. The
lip center is opaque; the surrounding skin fades to transparent. There are no
hard rectangular patch edges. Timing is a silent two-frame loop for inspection,
not yet Mumble playback. Both generated PNGs are preserved unmodified.

The generator did not preserve outside pixels exactly: `generated-v1/audit.json`
records a stride-three RGB comparison, with the mouth excluded. Mean absolute
channel difference outside that box was about 2.43/255, with 1.39% of sampled
outside pixels differing by more than 12/255. This is a generation trial, not a
claim of perfect registration. Feathering hides boundary differences but cannot
repair a shifted mouth; anchor alignment is still required for future frames.
The reusable mouth-edit prompt is included on the audition page.

`generated-v1/stress.html` expands the trial to small speech, a maximal shout,
broad smile, angry teeth/brows, closed eyes and wide eyes. Mouth/expression and
eye layers are independent. Adjustable ellipse masks are intersected with a
fixed, inward-feathered inner-face polygon. The base portrait is redrawn from the
master every frame, so source edits never own the hair, uniform or background.
An on-page pixel check compares the actual composite against the master outside
the permission region; oversized-mask and combined eye/mouth browser trials
reported zero changed pixels there. Sources remain unmodified.

The extreme shout is a known failure case: the generated chin crosses into the
collar. Protecting the fixed silhouette clips that jaw deformation. A separate
jaw/neck layer or whole head variant would be needed to preserve it. Smooth
crossfades are optional and may ghost; stepped switching makes registration
errors easier to inspect. This stress preview is silent and does not replace
the existing Mumble demo.

## Blended talking face

Open `generated-v1/talking.html` for the assembled Mumble-driven portrait. It
adds two mouth-only edits (`ah.png`, `oo.png`) alongside the existing `eh.png`.
The short voiced bursts use the audio clock, Mumble's clipping setting, and a
brief visual release; radio lead-in and punctuation pauses remain silent poses.
Expressions and localized left/right eyelids are separate layers, so a blink
does not replace the brows or suppress speech. Normal speech never uses the
extreme shout asset. Reduced motion retains a static expression with audio and
subtitles. Stop, replay and page exit cancel playback, including pending unlock.

Both stress and talking pages share `face-blend.js`, exposed as
`window.Driftworks.faceBlend`. `create(canvas, images)` returns `draw(layers)`,
`drawMask(canvas, shape)` and `protectedChanges()`. Shapes are percentage-space
`[centerX, centerY, radiusX, radiusY, featherPercent]`; layers have `image`, `shape`
and `alpha`. `speechCue(plan, elapsed)` gives the revealed text offset, mouth
asset and blend opacity. The master is resampled once to a frozen 512-square
canvas; every frame and pixel check use that exact reference. Load Mumble then
face-blend then talking; stress requires face-blend before its controller.

Run `node tests/talking-face.cjs` for real Mumble timing plus controller tests
covering radio silence, concurrent mouth/blink/expression layers, reduced motion,
pending unlock cancellation, stopping, completion and page cleanup. Real Canvas
masking, audio and visuals require browser verification; the on-page protected
pixel check covers the composited output.

The talking preview now uses `smile-soft.png`, a coordinated closed-lip smile
with cheek/eye engagement. The original broad smile remains in the stress test.
Expressions render at full opacity: mixing the old smile with neutral at 70%
left incompatible lip outlines visible. Speaking mouths also switch at full
opacity, using a larger `[48,61,13,8,20]` mask whose opaque core covers the union
of resting/smiling/speaking lips. Only the surrounding skin is feathered. This
avoids old corners surviving in the fade band or double lips during temporal
crossfades. The cue's short visual release controls when the mouth switches back
to the resting expression; its fractional alpha is not used to mix lip shapes.
The controller regression checks full-opacity expression/viseme selection and
opaque-core coverage of the wide corners and lower lip.
