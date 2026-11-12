package com.riwaq.art;

import android.service.dreams.DreamService;
import android.webkit.WebView;

/**
 * Riwaq as the TV's screensaver. It shows the artwork chosen in the app (same settings, same wall and frame);
 * any key wakes the TV as usual. Choose it in Settings › System › Ambient mode / Screen saver.
 */
public class ArtDream extends DreamService {
    private WebView web;

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);
        web = ArtView.create(this, "?dream=1", null, () -> { web = null; finish(); });
        setContentView(web);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        ArtView.wake(web);
    }

    @Override
    public void onDreamingStopped() {
        ArtView.sleep(web);
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (web != null) { web.destroy(); web = null; }
        super.onDetachedFromWindow();
    }
}
