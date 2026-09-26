# CLASSIC Terrain Generation (Gen 1)

**Branch:** CLASSIC  
**Status:** Current production behaviour (unchanged)

## Capabilities
- Deterministic 2D height-map terrain using simplex noise (Gustavson algorithm)
- Seeded via mulberry32 PRNG for reproducible worlds
- Multi-octave FBM (fractal Brownian motion) for continental + hill layers
- Tree placement using noise threshold (2-block margin from chunk edges)
- Beach, grass, snow biomes based on height
- All terrain generation happens in `Terrain.generateColumn()`

## Implementation
- **Noise class** (`src/engine/Noise.ts`): inline 2D simplex with permutation table
- **Terrain class** (`src/engine/Terrain.ts`): `surfaceHeight()` computes height-map, `generateColumn()` fills chunk columns
- **World class** (`src/engine/World.ts`): calls `terrain.generateColumn()` on-demand per column

## Behaviour
- Terrain is strictly 2.5D: every (x, z) column has exactly one surface height
- No caves, overhangs or floating islands
- Water fills below sea level (y=38)
- Trees are simple cylinders with leaf blobs, never crossing chunk boundaries

## Evaluation Metrics
- **Determinism:** Same seed always produces same terrain
- **Performance:** Columns generate in <10ms on median hardware
- **Visual quality:** Smooth transitions, no obvious artifacts
- **Memory:** ~200 chunks loaded within view distance
