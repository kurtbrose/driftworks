# Civilian shuttle pilots

Six reusable, uniformed space airline pilots, ages 36–62. `roster.json` groups
them under the stable `civilian-shuttle-pilot` category and records individual
IDs, ranks, personality notes, suggested existing voice slots and portrait slots.
These are civilian passenger crews, suitable for shuttle, liner and rescue missions.

`runtime/portrait-0.png` through `portrait-5.png` use the existing seven-frame
1792 × 256 radio portrait format: neutral, ah, oo, blink, smile, angry, afraid.
The existing face masks and Mumble speech clock animate their mouths and eyes.
The generated base faces and expression sheets are retained in `source/`;
`prompts.json` records the built-in imagegen prompts. The preparation script
`tools/prepare-civilian-portraits.ps1` packs the sheets for deployment.

Mission authors fetch the local roster through `Driftworks.assetUrl`, filter
`characters` by `category`, and retain a character's stable `id` in mission data.
Set a radio `Line`'s `civilianPortraitIndex` to the selected character's value.
This explicitly overrides `portraitIndex` for presentation; the existing numeric
combat voice/craft index remains independent. Invalid civilian slots fall back
to the normal mission cast. No mission is automatically reassigned to this pool.

Preview speech, blinking and moods in `experiments/civilian-cast.html`.
