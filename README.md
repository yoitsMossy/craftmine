# CraftMine HD (Three.js Minecraft Clone)

A high-fidelity voxel sandbox inspired by classic Minecraft gameplay loops, implemented with Three.js.

## What is implemented

- Procedural terrain with layered materials (stone, dirt, surface blocks).
- Tree generation using trunk + foliage rules.
- Mesh generation that only draws exposed cube faces (performance-friendly voxel meshing).
- HD-style pixel texture atlas generated at runtime (nearest-neighbor filtered for voxel clarity).
- First-person camera with pointer lock.
- Character movement:
  - WASD directional movement
  - Jump physics and gravity
  - Sprint and sneak speed modifiers
  - AABB + axis-resolved collision against blocks
- Block interaction:
  - Left-click mining
  - Right-click block placement with anti-self-trap placement checks
  - 8-slot hotbar with keyboard or mouse wheel selection
- Day/night sky tint and moving sunlight.
- In-game HUD (crosshair, coordinates, selected block, grounded state).

## Getting started

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

Open `http://localhost:4173`.

## Controls

- **WASD**: Move
- **Space**: Jump
- **Ctrl**: Sprint
- **Shift**: Sneak
- **Mouse move**: Look around (after click)
- **Left click**: Mine
- **Right click**: Place block
- **1-8** or **Mouse wheel**: Change selected block

## Architecture notes

- World storage uses a flat `Uint8Array` indexed via `x + width * (z + depth * y)`.
- Terrain generation uses fractal Brownian motion over value noise (`fbm`) for hills and variation.
- Geometry is rebuilt after edits and generated with hand-authored face data and UV packing.
- Texture atlas is painted into a canvas and uploaded to a `THREE.CanvasTexture`.

## Limitations vs full Minecraft

This clone focuses on the core sandbox loop and visual style, but does not yet include:

- Crafting/inventory UI
- Survival systems (health/hunger/mobs)
- Infinite chunk streaming
- Liquids/redstone/lighting propagation
- Multiplayer and save files

