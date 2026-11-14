# Capital gun audio

Approved listening set: recorded cannon firing, synthetic sub-pressure flyby,
and the one-second blast impact. These WAVs are the reviewed previews, copied
without processing. Runtime playback keeps their rate/pitch and applies the
existing proximity attenuation and weapons/impacts mixer channels.

- `fire.wav`: Thimras, “Battle at sea”, `cannon_fire_1.ogg`, CC0.
  https://opengameart.org/content/battle-at-sea
  Decoded at 48 kHz, mono, played at 94% speed, short end fade and peak
  normalized to 0.8. The approved preview is about 3.95 seconds.
- `impact.wav`: derived from the same CC0 cannon firing source (not the
  rejected ringing cannon-hit sample). Filtered, saturated blast layers at
  varied rates, normalized, trimmed to exactly one second with an end fade.
- `flyby.wav`: original synthetic non-repeating pressure pulse and short crack,
  48 kHz mono, 0.25 seconds. Broad bass energy peaks near 32 Hz; approximately
  93% of spectral energy is between 20 and 60 Hz. No oscillator pitch sweep.

CC0: https://creativecommons.org/publicdomain/zero/1.0/
