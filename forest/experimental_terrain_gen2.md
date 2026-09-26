# Experimental Volumetric Terrain — Generation 2 (TRIAL)

## Capabilities
- **3D density field**: each block sampled as `(surfaceHeight - y)/20 + cave_fbm3(x/32, y/32, z/32, 3 octaves) * 0.6`.
- **Caves**: turbulent 3D noise (lacunarity 2.2, gain 0.55) carves voids where density < 0.1.
- **Overhangs**: surface can extend above nominal heightmap if density remains positive.
- **Surface layer**: top solid block in a column still gets grass/snow/sand as in classic.

## Behaviour changes from classic
- **Air underground**: caves and tunnels appear mid-depth (y ∈ [10, SEA_LEVEL]).
- **Meshing load**: greedy meshing must handle interior faces; chunks with caves have ~2–4× more quads.
- **Generation time**: 3D noise sampling is ~3–5× slower than 2D heightmap per column (target).

## Selectable
`Terrain(seed, useVolumetric: boolean)` where `false` (default) → classic heightmap, `true` → volumetric.

## Evaluation targets
1. **Cave prevalence**: % of columns with >100 air blocks below y=SEA_LEVEL (target: >30%).
2. **Generation time**: mean ms per column for volumetric vs classic (target: <15 ms on i5-8250U).
3. **Frame impact**: max frame time when meshing 4 cave-heavy chunks vs 4 solid chunks (target: <50 ms spike).
4. **Player experience**: "caves feel natural" (qualitative; not a test metric).

## Known limitations
- No stalagmites/stalactites (pure noise, no post-process decoration).
- Water still fills to sea level; submerged caves flood (intended for underwater exploration).
- Tree placement uses 2D surface; trees do not spawn inside overhangs (acceptable compromise).
