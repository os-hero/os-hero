# Pixel Backgrounds

Original OS Hero artwork on a 39x26 RGBA grid (3:2). These ten PNGs are bundled locally, not fetched at runtime or copied from reference sites. All backgrounds are currently provided as starter items by explicit user decision.

- Catalog and localized names: `src/shared/backgrounds.js`.
- Saved selection: `character.json` -> `equipped.background`. Missing/invalid selection uses `background_meadow`.
- Composition: fixed 24x24 Hero at integer offset `(7,1)`; one-pixel left/right asymmetry avoids half-pixel interpolation on the odd-width canvas. Original opaque Hero pixels and poses are never changed. Shadows alpha-blend onto the environment.
- macOS menu bar: 39x26 logical points, 78x52 physical pixels at Retina. No added outline. Inventory/customization previews use the identical scene; small UI Hero icons remain transparent 24x24.
- Replace/edit a PNG at its existing path using exactly 39x26 pixels and full opacity. Keep central high-frequency details low and scenery at the sides. Do not add an outline to the character or animate the background separately.
- `npm run assets:backgrounds` reproducibly regenerates the initial native-grid artwork, overwriting these PNGs. Do not run it after manual asset edits unless replacement is intended; update generator/tests together when changing the source artwork.
- Missing, malformed, transparent or wrong-size assets fall back to the meadow; a missing meadow uses a minimal blue-sky/green-ground fallback. Backgrounds are decoded once and cached for the app lifetime.

Reference study only: the user's Pngtree meadow example, Google Images `pixel background landscape`, [Sir_Raitan's layered landscape](https://sir-raitan.itch.io/a-mountain-and-forest-landscape), and [Helianthus Games' biome landscapes](https://helianthus-games.itch.io/pixel-landscapes). Reference composition informed the distant hills/edge scenery and varied biomes; none of their pixels are bundled here.
