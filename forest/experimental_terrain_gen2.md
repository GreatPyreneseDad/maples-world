# EXPERIMENTAL Terrain Generation (Gen 2)

**Branch:** EXPERIMENTAL  
**Status:** Available but not default; opt-in via constructor flag

## Capabilities
- **All CLASSIC capabilities preserved** (2D height-map mode unchanged)
- **NEW:** 3D volumetric noise for future cave systems, overhangs, floating islands
- Production-grade simplex noise (jwagner library adaptation) with optimized gradient lookups
- 2D/3D noise functions with identical seeding behaviour to CLASSIC
- FBM support in both 2D and 3D

## Implementation
- **SimplexNoise class** (`src/engine/SimplexNoise.ts`): fast 2D/3D simplex with precalculated gradient tables
- **Migration path:** `Terrain` constructor will accept `useVolumetric: boolean` flag (future PR)
- **Compatibility:** SimplexNoise.noise2 / fbm2 produce statistically similar output to CLASSIC Noise

## Behaviour Changes
- **None in default mode:** CLASSIC terrain generation is unaffected
- **When enabled:** `Terrain` can call `noise.noise3(x, y, z)` to generate volumetric density fields
- Enables marching cubes or similar meshing for caves (requires separate mesher PR)

## Evaluation Metrics
- **Backwards compatibility:** CLASSIC tests pass unchanged
- **3D noise quality:** Values in [-1, 1], continuous, varied across space
- **Performance:** 2D noise ≤10% slower than CLASSIC (acceptable for offline generation), 3D adds <5ms per chunk column
- **Determinism:** Same seed produces identical 3D structure
- **Migration safety:** Can be toggled per-world without corrupting existing saves

## Future Work
- 3D terrain mesher (marching cubes or greedy meshing)
- Cave biomes (stalactites, underground lakes)
- Floating island height zones
- Underground ore veins following 3D noise contours
