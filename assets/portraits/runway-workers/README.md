# Runway workers

Six civilian spaceport ground crew NPCs in high-vis EVA workwear, with practical
industrial helmets and unobstructed faces for radio animation. A mixed-age crew:
three young adults (21, 24 and 28), two experienced workers (35 and 47), and one
older maintenance veteran (59). `roster.json`
categorizes them as `runway-worker`, with stable IDs, roles, ages, personality
notes, suggested existing voice slots and `runwayPortraitIndex` values 0–5.

Jo Mercer supervises the deck, Luis Ortega marshals arrivals, Asha Menon handles
fuel, Ben Harlow leads maintenance, Nadiya Bell handles cargo, and Kenji Sato
checks launch equipment. These are reusable characters; missions assign them
explicitly rather than changing any existing cast automatically.

Set a radio `Line`'s `runwayPortraitIndex` to the selected roster value. Use one
NPC pool index per line; a valid runway index takes precedence over the civilian
pilot index, then the ordinary mission cast. Invalid indices fall back through
that same order. Voice selection is independent of portrait selection.

`runtime/portrait-0.png` through `portrait-5.png` contain seven 256px poses in
the established order: neutral, ah, oo, blink, smile, angry, afraid. The existing
Mumble speech clock and face masks drive speech, blinking and moods. The shared
17-bitmap cache remains bounded when switching among NPC pools.

Generated expression sheets are retained in `source/`; `prompts.json` records
the built-in imagegen prompt set. Repack offline with:

```powershell
./tools/prepare-civilian-portraits.ps1 -Pool runway-workers
```

Preview and hear all six at
`experiments/civilian-cast.html?category=runway-workers`.
