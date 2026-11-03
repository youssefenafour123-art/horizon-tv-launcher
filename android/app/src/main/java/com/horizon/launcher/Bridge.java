package com.horizon.launcher;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

/** What the Horizon page can ask Android to do (window.Horizon in JavaScript). */
final class Bridge {
    private final MainActivity act;

    Bridge(MainActivity act) { this.act = act; }

    @JavascriptInterface public String apps() { return Apps.list(act); }

    @JavascriptInterface public boolean launch(String pkg) {
        try { return Apps.launch(act, pkg); } catch (Exception e) { return false; }
    }

    @JavascriptInterface public void openTvSettings() {
        try { act.startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    @JavascriptInterface public boolean canOverlay() {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(act);
    }

    @JavascriptInterface public void requestOverlay() {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            act.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + act.getPackageName())));
        } catch (Exception e) {
            // some TVs hide this screen; the debloat tool can grant it instead
            try { act.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.getPackageName()))); } catch (Exception ignored) { }
        }
    }

    /** list: JSON [{k, n, ar, t (epoch ms), city}] of upcoming athans that are switched on */
    @JavascriptInterface public void schedule(String list, float volume) {
        AthanScheduler.save(act, list, volume);
        AthanScheduler.reschedule(act);
    }

    @JavascriptInterface public void testAthan(String key, String name, String ar, String time, String city) {
        AthanService.start(act, key, name, ar, time, city);
    }

    @JavascriptInterface public String version() { return "1.0"; }
}
