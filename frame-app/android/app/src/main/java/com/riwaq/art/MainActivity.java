package com.riwaq.art;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

/** Riwaq: the TV as a framed artwork. The screen stays on while the art is showing, like a painting on the wall. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        build();
    }

    private void build() {
        web = ArtView.create(this, pieceQuery(getIntent()), new Bridge(this), () -> { web = null; recreate(); });
        setContentView(web);
        hideSystemUi();
        web.requestFocus();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    // Back is handled by the page: it closes the gallery or panel first, and only leaves from the bare wall
    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web != null) {
            web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))", null);
            return true;
        }
        if (code == KeyEvent.KEYCODE_MENU && web != null) {
            web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true}))", null);
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @SuppressWarnings("MissingSuperCall")
    @Override
    public void onBackPressed() { /* handled in onKeyDown */ }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        ArtView.wake(web);
    }

    // another app or the screensaver is on top: no animation, no timers
    @Override
    protected void onPause() {
        super.onPause();
        ArtView.sleep(web);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** am start -n com.riwaq.art/.MainActivity --es piece monet-sunrise : open on that artwork (handy for testing) */
    private static String pieceQuery(Intent i) {
        String id = i == null ? null : i.getStringExtra("piece");
        return id == null ? null : "?piece=" + id.replaceAll("[^a-z0-9-]", "");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String q = pieceQuery(intent);
        if (q != null && web != null) web.evaluateJavascript("window.RiwaqApp && RiwaqApp.show('" + q.substring(7) + "')", null);
    }

    void exit() { runOnUiThread(this::finish); }
}
