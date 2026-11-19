# Heatline: Marisol Bay

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/clmthy/open-world-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/clmthy/open-world-game/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for [make.fun's gta6-01 bounty](https://make.fun/bounty/gta6-01).
It runs offline in a desktop browser from static files — no network, no build step.

## The game

Dez Calloway is out after three years inside. The man who set him up owns Marisol Bay now.
Steal cars, run cargo for the Velasquez family, gather the evidence on Halden — and take the
drive to Pelican Tower.

- **A city to explore** — Marisol Bay: Coral Strand beach avenue, Ironreef Docks, Halcyon
  Heights villas, and the Saltmarsh highway, each with its own palette.
- **On foot and by car** — third-person walking, car stealing, arcade driving with handbrake
  drifts, traffic and pedestrians who flee gunfire.
- **Wanted system** — 0 to 5 levels; police cars chase, ram and roadblock you, a helicopter
  with a searchlight joins at level 3. Escape the view circle or pay for a respray.
- **7 story missions** — Fresh Air, Hot Plates, Low Tide, Glass House, Static, Saltmarsh Run
  and Broadcast, with dialogue, objectives, markers and rewards.
- **Combat** — fists, pistol, SMG, shotgun, rifle, molotovs and frags, with enemy goons who
  shoot back.
- **HUD with minimap** — mission route, police dots, wanted slashes, speed, health, armor,
  ammo, subtitles.
- **Start screen, pause map and saves** — three localStorage save slots, autosave on mission
  complete, quality settings.

## Play it

Serve `game/` with any static server and open `index.html`:

```sh
node serve.ts
# open http://localhost:8080
```

Controls: WASD move/drive · mouse look · E enter/exit car · F shoot/punch · 1–7 weapons ·
Space handbrake · C camera · Esc pause · R respray at a repair shop.

## Tech

- `three.js` r160 module build, vendored at `game/vendor/three.module.min.js`.
- All art is procedural (canvas textures, boxes, cylinders) and all sound is synthesized with
  WebAudio — no external assets, no network requests.
- Deterministic screenshot staging: `?shot=broadcast|lowtide|freshair|pause&seed=1`.

## License

MIT — see [LICENSE](LICENSE).
