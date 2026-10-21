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
