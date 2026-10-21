# River continuation study

Two adjacent unique panels, each used once. This is a local art-direction study,
not a full-sphere skybox and not selected by flight.

Panel A is `../star-river-photo-panel-v1.png`. Panel B was generated with built-in
imagegen, referencing A and requesting a new region to its right with 25% overlap.
The exact prompt is in `provenance.json`.

`joined.png` uses a 25% raised-cosine feather in linear light. B receives a common
exposure adjustment to match the overlap's average luminance. This conceals the
join but does not enforce exact continuation of individual stars or dust lanes.
No rotation, reflection or reuse of a panel occurs in the composition.
