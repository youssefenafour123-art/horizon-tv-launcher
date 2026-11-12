package com.riwaq.art;

import android.webkit.JavascriptInterface;

/** window.RiwaqNative in the page. */
final class Bridge {
    private final MainActivity activity;

    Bridge(MainActivity activity) { this.activity = activity; }

    @JavascriptInterface
    public void exit() { activity.exit(); }
}
