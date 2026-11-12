# AI paintings for Horizon

Generate these with Gemini (Nano Banana Pro), one image per prompt.

**Saving:**
- Save each as a JPEG named exactly as shown (e.g. `chaouen-dusk.jpg`), in this folder (`wallpapers/ai/`).
- Use **16:9**, ideally 2560×1440 or larger. Horizon resizes them.
- Then rebuild the APK, or ask Claude to. Each painting appears under Settings → Wallpaper → Category → **AI paintings**.

**Composition (the same for all):**
- The clock sits at the top-left, the matches card at the top-right, and your apps along the bottom.
- So keep the main subject in the **center**, with calm sky in the upper corners and a darker, simpler lower third.
- No text, no logos, no people looking at the camera.

Add this line to every prompt:

> Ultra-detailed painterly matte painting, cinematic wide 16:9 composition, soft volumetric light, rich but natural colors, calm upper corners and a darker simple foreground band at the bottom, no text, no watermark.

| File | Prompt |
|---|---|
| `chaouen-dusk.jpg` | Chefchaouen at blue hour, terraced blue-washed houses climbing the Rif mountainside, warm lamps glowing in windows, the Spanish mosque on the hill, first stars over the peaks. |
| `riad.jpg` | Inside a traditional Moroccan riad in Marrakech, a zellige fountain in the courtyard, carved cedar balconies, orange trees in pots, soft morning light falling from the open roof. |
| `sahara-night.jpg` | A Berber camp in the Erg Chebbi dunes at night, lantern-lit tents, a small campfire, camels resting, the Milky Way arching over the dunes. |
| `atlas-dawn.jpg` | An earthen Amazigh village on a High Atlas slope at dawn, snow on the far peaks, terraced walnut fields, mist in the valley, first pink light on the summits. |
| `essaouira-storm.jpg` | Essaouira's Skala ramparts and bronze cannons above the Atlantic, waves breaking on the rocks, seagulls, golden late-afternoon light breaking through storm clouds. |
| `fes-tannery.jpg` | Fes el-Bali seen from the rooftops at sunset, a sea of medina roofs, green-tiled minarets, the Chouara tannery's colored dye pits, warm haze. |
| `koutoubia-moon.jpg` | The Koutoubia minaret in Marrakech at night under a full moon, palm silhouettes, the ochre city wall, a deep indigo sky. |
| `oasis.jpg` | The Draa valley palm oasis at golden hour, a crumbling kasbah beside a winding river, date palms, distant red mountains. |
| `zellige.jpg` | A quiet Moroccan palace hall: a horseshoe arch framing a garden, intricate zellige tilework and carved plaster, sunlight on the floor, serene and symmetrical. |
| `caravan-gold.jpg` | A camel caravan crossing the crest of a huge Sahara dune at sunset, long shadows, wind lifting sand from the ridge, golden-orange sky. |

**Want a different place?** Add a line for it in the `AI` list in `shared/sky.js`, as `['file-name', 'Name shown in Settings']`, and save the image with that file name.
