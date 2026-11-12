# Riwaq · رواق

*Art beneath the arch.* Riwaq turns an Android / Google TV into framed wall art, in the spirit of a "Frame TV".
A *riwāq* is the arched gallery around a courtyard, as in the Qarawiyyin in Fez or a riad in Marrakech.

- **50 works**: masterpieces, Islamic art and Morocco, Japanese prints, photography and illustration. All are public-domain or CC0 museum scans (see [CREDITS.md](CREDITS.md)), plus two zellige panels drawn by Riwaq itself.
- **Fireplace**, its own collection, with crackling sound: *Modern Hearth* (a linear fireplace with simulated flames, `tools/fire_sim.py`) and *Stone Hearth* (a real fire filmed by the U.S. National Park Service at Mount Rainier).
- **Living art**: about a third of the pieces move gently. Monet's water shimmers, rain falls in Hiroshige, the stars breathe over the Rhône, dust drifts through Hammershøi's sunbeam, light passes over the gold of the Blue Qur'an. *The Four Seasons* follows the real calendar.
- **Frames**: like a frame TV, the screen is the frame. The moulding runs along the screen edges and the art fills everything inside it. Options: Curated (each piece gets the frame that suits it), the Riwaq horseshoe arch, walnut, gilded, zellige and full screen, plus *Whole artwork* to see a piece uncropped. **Walls**: plaster, linen, riad teal, terracotta, zellige green and night ink.
- Optional slideshow (every 15 min / hour / day), from everything, from the living pieces or from one collection.
- It can also run as the TV's **screensaver**.

## Remote

| On the wall | |
|---|---|
| OK | Gallery |
| ▲ or Menu | Frame & wall |
| ◀ ▶ | Previous / next piece |
| ▼ | Caption |
| Back | Leave Riwaq |

## How it's built

A plain HTML/CSS/JS page (`web/`) in a WebView, served from the APK's assets, inside a tiny Java shell with no libraries (`android/`). It's the same approach as the Horizon launcher in this repository.

The artwork is a still `<img>`, decoded once. The motion is painted on one small canvas over it at about 15 fps, and only the moving parts are drawn (water strips, raindrops, petals, star glints). Everything stops when Riwaq isn't on screen. There are no perpetual CSS animations, blurs or backdrop filters, because the TV's GPU can't afford them.

```
tools/pieces.py         the collection: sources, collections, motion settings
tools/fetch_art.py      downloads from Wikimedia Commons, checks every licence, writes web/art, web/thumbs, web/catalog.js, CREDITS.md
tools/make_fireplace.py the fireplace loops (seamless picture and crackle)
tools/fire_sim.py       the Modern Hearth fire simulation
tools/zellige.py        draws the two zellige panels and the zellige frame tile
tools/make_drawables.py the app icon and TV banner (vector, lettering outlined from the brand fonts)
brand/brand.html        the brand sheet
```

Build: `cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease`
Preview on a PC: serve `web/` (e.g. `python -m http.server -d web`), then use the arrow keys, Enter and Escape.
