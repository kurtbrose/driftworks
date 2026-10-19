# Retail ship and weapon sandbox

The flight lab imports **35 fighter/bomber stat profiles** and **10 primary bolt weapons** from the installed retail FreeSpace 2 `Root_fs2.vp`. The catalog includes Terran, Vasudan and Shivan craft, not just GTVA player fighters. No models, textures, sounds, descriptions or other retail artwork are copied.

## Try configurations

In the lab's **AI DUEL / WATCH PILOT** panel, select the testing pilot, its ship stats, and the opponent ship stats. **Match test pilot** gives both the same ship. **Each ship's default primary** selects the first supported primary in that ship's table; choosing a named cannon gives both that cannon. The CLI also supports separate weapon overrides. All loadout changes reset and pause the duel.

**Ship's retail hull and shields** is the default. Both pilots receive the hull and shield capacity of their respective selected class, including aliens. **Unshielded training variant** removes shields from both, retaining class hull and handling. It is an explicit sandbox override, not a claim that the class normally lacks shields. The original Hercules is a separate choice from Hercules Mark II: its retail values are 250 hull / 600 shields, versus 275 / 610 for Mk II. Early campaign ship instances can have mission-specific settings; those are not inferred from the class name. The selected initial mission's Hercules class entries did not establish a class-wide unshielded variant.

The **Ship artwork · cosmetic** section changes the two displayed models independently. These are existing Driftworks/Quaternius models; a Shivan stat profile does not imply an imported Shivan mesh. Artwork changes preserve the current duel and nominal DPS, but determine muzzle placement and volley size. Hit spheres remain the benchmark's existing sizes regardless of model. Handling, class hull and weapon choice are physical settings, not inferred from artwork.

Normal manual flight also gets the selected class's hull/shields and the expanded primary selection. Spawned lab opponents and wingmen receive their own class defenses. Low-health evasion now uses half maximum hull, preserving the old 45/90 threshold proportion. AI lead uses its equipped weapon's projectile speed, and fire is bounded by weapon lifetime as well as its existing tactical range cap. Other opponent decisions are unchanged.

## What is imported versus adapted

Imported numeric fields include each ship's damping, rotational damping, three-axis velocity and turn times, acceleration/deceleration, reverse speed, overclock speed, boost velocity/acceleration, total shield strength, hull hitpoints, power output, boost fuel/burn/recovery, and primary gun-bank slot counts from the retail POF `GPNT` records. Each profile records its source model filename and SHA-256; no model geometry or hardpoint coordinates are copied. Default primary names and species identify the presets. Weapons carry projectile speed/lifetime, refire interval, damage, shield/armor factors, energy use and bolt dimensions/colors.

Runtime adaptations are explicit:

- Shields are **one pooled total**, not FreeSpace's four directional quadrants. Both sides use the same absorption/spillover formula, seven-second post-hit delay and 12 shield points/second recovery, capped at their class capacity. Those recharge rules are Driftworks rules, not extracted FreeSpace ETS behavior. Shield hits delay recovery just like hull hits.
- Guns fire from reviewed muzzle anchors on the **visible Quaternius mesh**, in the same local metre coordinates and pose transform as the artwork. Striker retains its two asymmetric barrel tips. Other ships use forward weapon sockets; models with a single central socket fire one bolt per volley. The training blockout uses two mounts. `shipPackModels.gunAnchors` owns these attachments alongside engine anchors. These meshes have no named weapon sockets, so anchors are an authored interpretation of visible geometry, not source metadata.
- Sustained damage is preserved: `volley interval = weapon.fireWait * visible muzzle count / imported gunMounts`. Projectile damage, speed and lifetime stay unchanged. Ship collisions sweep the visible bolt head radius against model triangles, including edges and vertices; confirmed contacts drain shields first, then spill into hull damage. Six imported mounts at 0.2 seconds become two visible muzzles every 0.0667 seconds (30 bolts/second). Smaller volleys reduce burst damage while increasing cadence. Both pilots, manual flight, NPCs and headless duels share this rule. Artwork changes can change placement/count and cadence while retaining nominal DPS. Close-surface retraction and shared convergence remain supported.
- Counts come from model `GPNT` bank records rather than the optional briefing-display `+Gun Mounts` field. That field omits the Shivan counts and disagrees with several models (for example Perseus advertises 2 but has 4 gun points). `primaryBankMounts` retains the bank breakdown; `gunMounts` is its sum. The model geometry stays in the installed VP archive.
- Energy and afterburner fuel remain unlimited. Imported power/fuel figures are reference data for future resource modeling, not an implemented ETS system.
- Shivan lateral/reverse capabilities are retained in the raw profile, but existing testing pilots use forward flight and no lateral aiming. No glide, stealth, subsystem damage, missiles, EMP, capital-ship weapons or alien special ability is introduced. The arcade integrator is unchanged.
- Primary-bank overrides intentionally allow sandbox combinations beyond retail loadout restrictions. Subsystem/puncture weapons such as Akheton, flak-like effects and beams are excluded rather than approximated as ordinary damage bolts. All 35 selected ships have a supported first default primary.

These presets are sourced starting points, not a claim of exact retail combat balance. Shield pooling, simultaneous primary banks, unlimited energy, triangle collision hulls and opponent timing all affect TTK. Compare one setting at a time before tuning AI behavior.

## Representative choices

| Class | Species | Cruise / boost m/s | Hull | Total shields | Default first primary |
| --- | --- | ---: | ---: | ---: | --- |
| GTF Ulysses | Terran | 70 / 150 | 180 | 380 | Subach HL-7 |
| GTF Hercules (original) | Terran | 50 / 120 | 250 | 600 | Subach HL-7 |
| GTF Hercules Mark II | Terran | 55 / 120 | 275 | 610 | Subach HL-7 |
| GTF Pegasus | Terran | 90 / 160 | 220 | 330 | Subach HL-7 |
| GTF Erinyes | Terran | 65 / 130 | 325 | 500 | Subach HL-7 |
| GVF Horus | Vasudan | 90 / 170 | 170 | 230 | Mekhu HL-7 |
| GVF Thoth | Vasudan | 65 / 130 | 200 | 200 | Prometheus R |
| SF Dragon | Shivan | 75 / 150 | 100 | 700 | Shivan Heavy Laser |
| SF Basilisk | Shivan | 65 / 110 | 100 | 950 | Shivan Mega Laser |
| SF Mara | Shivan | 70 / 120 | 200 | 620 | Shivan Mega Laser |

Use the actual catalog for all values; the lab readout shows current and maximum defenses for both pilots. Older hulls and newer alien craft differ in several dimensions rather than forming a single difficulty ladder.

The weapons are Subach HL-7, Prometheus R/S, UD-8 Kayser, Maxim, Mekhu HL-7, Shivan Light/Heavy/Mega Laser, and Vasudan Light Laser. Shield/armor factors matter: for example Maxim's shield factor is 0.2 and armor factor 1.3, while Prometheus S uses 1.0 and 0.9.

## Provenance and regeneration

Source table SHA-256, over original unmodified bytes:

- `ships.tbl`: `60266906ff4bc25932ecda1aa8070c92de0e7ab6cde42c2d5a02169c7e6315ca`
- `weapons.tbl`: `9e94ba10b7cd5acafefb22dcaada2545ca40d713fae112597a4dca1f63db6f9a`

These match the earlier four-ship/two-weapon import. The offline importer reads VP v2 directory entries, strips table comments, selects small-craft classes and the supported bolt weapons, validates required numeric fields, and writes ordinary checked-in JavaScript. The importer reads primary-bank counts from sibling `sparky_fs2.vp` by default; use `--models <path>` for another location. `--check` verifies both the table fields and all 35 model-derived counts and hashes. Retail data is never fetched at runtime.

```powershell
node tools/import-retail-flight.cjs "E:/GOG Galaxy/Games/Freespace 2/Root_fs2.vp"
node tools/import-retail-flight.cjs "E:/GOG Galaxy/Games/Freespace 2/Root_fs2.vp" --check
```

The first four profile indexes and first two weapon indexes are preserved. Other entries follow them; the UI displays class and species names. CLI indexes are array positions in `experiments/retail-profiles.js` / `retail-weapons.js`:

```powershell
# Original Hercules versus Dragon; each uses its native first primary.
node tools/evaluate-flight-ai.cjs --start headOn --category perfect --skill 1 --ship 1 --opponent-ship 31 --seconds 30
# Same setup with both shields explicitly removed.
node tools/evaluate-flight-ai.cjs --start headOn --category perfect --skill 1 --ship 1 --opponent-ship 31 --seconds 30 --unshielded
# Both use Prometheus S; --opponent-weapon can override only the opponent.
node tools/evaluate-flight-ai.cjs --start crossing --category human --flavor practiced --skill 1 --ship 1 --weapon 2 --seconds 30
```

Duel replay schema is version 5: options include both ship/weapon choices, resolved collision models and the defense override; results include both shield pools and maximum defenses. Versions 1-4 require their original source revision and are rejected because their firing rules differ. Historical baselines remain unchanged.

The recorded seed-1 perfect-pilot head-on Hercules-versus-Dragon example lasted **12.16 seconds with retail shields**, versus **1.60 seconds with shields removed**. These are single deterministic diagnostic bouts, not estimates of player TTK or evidence that the matchup is balanced. See the paired JSON captures under `tests/benchmarks/flight-retail-*.json` for full source fingerprints and health/outcome metrics.
