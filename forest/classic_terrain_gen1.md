# Classic Terrain — Generation 1 (BASELINE)

## Capabilities
- **2D heightmap**: simplex fBm at two scales (continental 260 Hz, hills 48 Hz) produces surface height in [4, WORLD_HEIGHT-20].
- **Beaches**: sand below sea level + 1; grass/dirt above.
- **Snow cap**: grass replaced by snow above y=64.
- **Trees**: noise-seeded placement at density threshold 0.86, trunk 4–6 blocks, sphere crown.
- **Water fill**: fills to sea level (38).

## Behaviour
- Deterministic from seed: same (x, z) → same surfaceHeight.
- Column generation is atomic: all 8 vertical chunks filled in one call.
- Trees confined to 2-block inset from chunk edges (no cross-chunk writes at gen time).

## Metrics
- **Generation time**: ~2–4 ms per column (16×128×16) on average hardware (target, not measured).
- **Solid fill**: typically 60–75% of blocks are non-air below surface.
- **Trees per chunk**: mean ~1.2 (depends on biome/height).
