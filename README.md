# Horizon — Android TV home screen with prayer times & athan

A calm, lightweight home screen (launcher) for **Android TV / Google TV**. It replaces your TV's
home with a live wallpaper that follows the real sun and moon, your apps in a clean row, the
five daily prayer times, and a **full athan that plays at every prayer**, even while you're
watching something else.

![Horizon at night](docs/screenshots/home-night.jpg)

**[⬇ Download the latest APK](https://github.com/youssefenafour123-art/horizon-tv-launcher/releases/latest)** · 2.2 MB · Android 7.0+ · no ads, no tracking, no account

---

## What you get

| | |
|---|---|
| **Live wallpaper that follows the sky** | Painted scenes (Sahara, Atlas lake, Essaouira coast, rolling hills, medina) whose sky is calculated from the real position of the sun and moon where you live: before dawn, sunrise, midday, afternoon, golden hour, sunset, dusk and night, with stars, the Milky Way, the moon in its real phase, clouds and birds. |
| **Prayer times, offline** | Calculated on the TV itself (no internet needed after your city is known). Methods: Morocco (Habous), Muslim World League, Umm al-Qura, Egyptian, Gulf, Karachi, ISNA, Algeria, Tunisia, Turkey (Diyanet), France (UOIF). Standard or Hanafi Asr. Picked automatically from your country. |
| **Full athan at each prayer** | Uses Android's alarm system, so it plays even inside Netflix or YouTube, survives reboots, pauses what's playing, and shows a full-screen athan card. Any remote button stops it. Each prayer can be switched on or off separately, and the volume is adjustable. |
| **Your real apps** | Every installed app with its own TV banner. The selected app gets a glowing edge in its own color. **Hold OK on an app to move it**: ◀ ▶ to move, ▲ to put it first. |
| **Make it yours** | 7 font styles, clock size and weight, an accent color that can follow the sky, 12/24-hour clock, five scenes, live or still wallpaper, dim level, and a Quran verse that changes through the day. |
| **Hijri date** | Umm al-Qura calendar, with a ±2-day adjustment for local moon sighting. |
| **Ambient mode** | After a quiet minute the interface fades and only the sky and the clock remain. |

## Screenshots

All screenshots come from a real TCL Google TV (1080p). The apps shown are simply the ones installed on that TV; Horizon shows whatever *you* have installed.

**The same screen through the day** (the wallpaper follows the real sun):

| Before dawn | Sunrise |
|---|---|
| ![Before dawn](docs/screenshots/before-dawn.jpg) | ![Sunrise](docs/screenshots/sunrise.jpg) |
| **Midday** | **Afternoon** |
| ![Midday](docs/screenshots/midday.jpg) | ![Afternoon](docs/screenshots/afternoon.jpg) |
| **Sunset** | **Night** |
| ![Sunset](docs/screenshots/sunset.jpg) | ![Night](docs/screenshots/home-night.jpg) |

**Your apps**, with their own banners. The selected app glows in its own color, and you can hold OK to reorder:

![Apps row](docs/screenshots/apps-focus.jpg)

**Athan screen**, shown at prayer time over whatever is playing:

![Athan](docs/screenshots/athan.jpg)

**Settings**, with every change previewed live behind the panel:

![Settings](docs/screenshots/settings.jpg)

> The "Time-lapse" pill at the top of some screenshots is the built-in preview that plays a whole day in one minute. It isn't shown normally.

---

## Install

You need a computer on the same Wi-Fi as the TV, plus Google's free **adb** tool ([platform-tools](https://developer.android.com/tools/releases/platform-tools)).

1. **On the TV**: Settings → System → About → click **Android TV OS build** 7 times. Then in Settings → System → **Developer options**, turn on **USB debugging** (and **Wireless/Network debugging** if listed). Note the TV's IP address (Settings → Network).
2. **On the computer**:
   ```bash
   adb connect 192.168.1.40:5555        # your TV's IP; accept the prompt on the TV
   adb install Horizon-1.0.apk
   ```
3. Open **Horizon** from the TV's app list. On first launch, allow location if asked (used only to pick your city; you can also choose a city by hand).

You can also sideload it with a USB stick or the *Downloader* app.

### Make Horizon your home screen

Press **Home** on the remote. If the TV asks which home app to use, choose **Horizon → Always**. Done.

**Google TV doesn't ask**: it keeps its own home on the Home button. To switch it off *for your user only* (nothing is deleted, and it's fully reversible):

```bash
adb shell cmd package set-home-activity --user 0 com.horizon.launcher/.MainActivity
adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
adb shell pm disable-user --user 0 com.google.android.tungsten.setupwraith
```

`setupwraith` is Google's setup/recovery screen; if it stays on, it takes over the Home button.

**To go back** to the original Google TV home at any time:

```bash
adb shell pm enable com.google.android.apps.tv.launcherx
adb shell pm enable com.google.android.tungsten.setupwraith
```

A factory reset also restores everything.

### Optional: show the athan over other apps

Sound always plays. To also see the athan card while another app is open, go to Horizon → Settings → Home screen → **Athan over other apps** and allow it (or run `adb shell appops set com.horizon.launcher SYSTEM_ALERT_WINDOW allow`).

---

## Using it

| Remote | What it does |
|---|---|
| ◀ ▶ ▲ ▼ | Move around |
| OK | Open the app |
| Hold OK on an app | Move mode: ◀ ▶ moves it, ▲ puts it first, OK or Back drops it |
| Back | Close a panel (Back never leaves the home screen) |
| Home | Return to Horizon and jump to the first app |
| ⚙ (top right) or the **Settings** card | Settings |

**Settings sections**

- **Appearance**: font style (Modern, Elegant, Editorial, Rounded, Minimal, Tech, Bold), clock size and weight, accent color, 12/24-hour, seconds
- **Wallpaper**: scene, mode (Live · Still · My photos), dim, parallax, "Preview a full day"
- **Home screen**: greeting, verse, how often the verse changes, prayer timeline, ambient mode delay, reset app order, athan over other apps, Android TV settings
- **Prayer times**: location (automatic or a list of cities), calculation method, Asr, Hijri date ±days
- **Athan**: on/off, volume, on/off per prayer, test

**Your own photo wallpapers**: put `dawn.jpg`, `sunrise.jpg`, `morning.jpg`, `noon.jpg`, `afternoon.jpg`, `golden.jpg`, `sunset.jpg`, `dusk.jpg`, `night.jpg` in `wallpapers/` before building, then choose *Wallpaper → Mode → My photos*. Ready-made AI prompts are in [wallpapers/PROMPTS.md](wallpapers/PROMPTS.md).

---

## Privacy & permissions

Horizon has **no analytics, no ads, no account and no server of its own**. The only network requests it makes:

- **Your approximate location**, once, to find your city: from the TV's location if available, otherwise from your IP address via [ipwho.is](https://ipwho.is) (fallback [ipapi.co](https://ipapi.co)). It's stored only on the TV. Choosing a city by hand stops this.
- **Fonts** from Google Fonts (cached after the first load).

| Permission | Why |
|---|---|
| Internet, network state | Location lookup and fonts above |
| Approximate location | Prayer times for where you are |
| Query all packages | A launcher must list your installed apps |
| Exact alarms, boot completed, wake lock | Play the athan on time, even after a restart |
| Foreground service (media), notifications, full-screen intent | Play the athan over other apps and show its card |
| Display over other apps (optional) | Show the athan card while another app is open |

---

## Debloat tool (optional, Windows)

[`tools/debloat.ps1`](tools/debloat.ps1) connects to your TV over Wi-Fi and lists preinstalled bloat it recognizes (Google extras, Xiaomi, TCL, Sony, Hisense, Philips…) so **you** choose what to remove. Details:

- It only removes apps *for the TV user* (`pm uninstall --user 0`), never from the system, and logs everything. Running it again and choosing **Restore** brings it all back.
- Core parts (settings, Play Services, Bluetooth, keyboard, Chromecast, voice) are protected and never touched.
- It keeps the stock home screen until Horizon is installed.

```powershell
powershell -ExecutionPolicy Bypass -File tools\debloat.ps1
```

Use it at your own risk and only remove things you recognize.

---

## Build from source

Requirements: JDK 17+ and the Android SDK (API 36). Android Studio includes both.

```bash
cd android
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

The release build is signed with the local debug key so it can be sideloaded straight away. For distribution, sign it with your own key.

**Try the interface in a browser**, with no TV needed (keyboard arrows act as the remote; `T` time-lapses a day, `A` tests the athan, `S` opens settings):

```bash
python -m http.server 5180
# open http://localhost:5180/horizon/
```

In the browser the app row shows sample apps (logos from [Simple Icons](https://simpleicons.org)); on a TV it shows your real installed apps.

### How it's built

```
horizon/index.html     the home screen (layout and styles)
shared/
  sky.js               live wallpaper: real sun/moon position, palettes, scenes, clouds, stars
  prayer.js            prayer time engine (PrayTimes algorithm, runs offline)
  launcher.js          clock, location, Hijri, apps, verses, scheduling bridge
  look.js              fonts, accent, clock size, appearance toggles
  remote.js            D-pad focus engine (spatial navigation, hold-OK, ambient mode)
  settings.js          the settings panel
  athan.js             athan overlay for the browser preview
android/               tiny native shell (no libraries, ~25 KB of code)
  MainActivity         home screen WebView, serves the UI from inside the APK
  Apps                 installed apps, real banners/icons, brand colors, launching
  AthanScheduler       arms the next athan as an exact system alarm
  AthanService/Activity  plays the athan (pauses other media) and shows the athan card
  BootReceiver         re-arms alarms after reboot / time change
tools/debloat.ps1      optional TV debloat helper
```

The interface is HTML/CSS/JS, bundled inside the APK and served locally (it works offline). The native side handles everything a web page can't do: being the Home screen, listing and launching apps, and athan alarms.

**Debugging on a TV**: `adb logcat -s Horizon` shows the page's console. Pressing **P** on a keyboard runs a 5-second smoothness probe and logs the frame rate.

---

## Credits

- **Athan recording**: *Omar Hisham Al Arabi*, included as `assets/athan.mp3`. All rights to the recording belong to its owner; it isn't covered by this project's license. If you're the rights holder and want it removed, please open an issue.
- Prayer time calculation based on the [PrayTimes.org](http://praytimes.org) algorithm.
- Fonts from [Google Fonts](https://fonts.google.com) (Outfit, Plus Jakarta Sans, Instrument Serif, Fraunces, Figtree, Readex Pro, Geist, Space Grotesk, Bricolage Grotesque, Noto Kufi Arabic, Amiri, Noto Naskh Arabic, IBM Plex Sans Arabic, Cairo).

App names and logos belong to their respective owners. Horizon isn't affiliated with Google, TCL or any app shown.

## License

Source code: [MIT](LICENSE). The athan recording is excluded (see Credits).
