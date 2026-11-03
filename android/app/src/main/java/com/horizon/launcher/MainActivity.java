package com.horizon.launcher;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** The home screen: the Horizon UI in a WebView, served from the APK's assets under a secure origin. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/web/horizon/index.html";

    private WebView web;
    private BroadcastReceiver packageReceiver;
    private String pendingJs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setOffscreenPreRaster(true); // keep tiles rasterized: no blank flashes when sliding the app row

        web.addJavascriptInterface(new Bridge(this), "Horizon");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serve(u);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (pendingJs != null) { view.evaluateJavascript(pendingJs, null); pendingJs = null; }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !HOST.equals(req.getUrl().getHost());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, hasLocation(), false);
            }

            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                android.util.Log.d("Horizon", m.message() + " @" + m.lineNumber());
                return true;
            }
        });

        // warm the app list and banners off the main thread while the page boots
        new Thread(() -> { try { Apps.list(this); } catch (Exception ignored) { } }, "apps-warmup").start();

        setContentView(web);
        hideSystemUi();
        pendingJs = orderJs(getIntent());
        web.loadUrl(START);
        web.requestFocus();

        if (Build.VERSION.SDK_INT >= 23 && !hasLocation()) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
        }

        // keep the app row in sync when apps are installed or removed
        packageReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                Apps.clearCache();
                js("window.TV && TV.native && TV.native.appsChanged()");
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        registerReceiver(packageReceiver, f);

        AthanScheduler.reschedule(this);
    }

    private boolean hasLocation() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "application/javascript"); MIME.put("css", "text/css");
        MIME.put("mp3", "audio/mpeg"); MIME.put("jpg", "image/jpeg"); MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml"); MIME.put("json", "application/json"); MIME.put("md", "text/plain");
    }

    private WebResourceResponse serve(Uri u) {
        String path = u.getPath() == null ? "" : u.getPath();
        try {
            if (path.startsWith("/icon/")) {
                byte[] png = Apps.image(this, path.substring(6), "1".equals(u.getQueryParameter("banner")));
                if (png == null) return notFound();
                return new WebResourceResponse("image/png", null, new ByteArrayInputStream(png));
            }
            String asset = path.substring(1);
            String ext = asset.substring(asset.lastIndexOf('.') + 1).toLowerCase();
            InputStream in = getAssets().open(asset);
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            return new WebResourceResponse(mime, mime.startsWith("text") || mime.endsWith("javascript") ? "utf-8" : null, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not found");
        return r;
    }

    void js(String code) {
        if (web != null) web.post(() -> web.evaluateJavascript(code, null));
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    // Back never leaves the home screen: it closes panels inside Horizon
    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @SuppressWarnings("MissingSuperCall")
    @Override
    public void onBackPressed() { /* handled in onKeyDown */ }

    // pressing Home while already home: reset to the first app
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        js("window.TV && TV.native && TV.native.home()");
        String order = orderJs(intent);
        if (order != null) js(order);
    }

    /** am start -n com.horizon.launcher/.MainActivity --es order "pkg1,pkg2,…" puts those apps first */
    private static String orderJs(Intent i) {
        String order = i == null ? null : i.getStringExtra("order");
        if (order == null) return null;
        org.json.JSONArray ids = new org.json.JSONArray();
        for (String p : order.split(",")) if (!p.trim().isEmpty()) ids.put(p.trim());
        return "window.TV && TV.setAppOrder(" + ids + ")";
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        web.onResume();
        web.resumeTimers();
        js("window.TV && TV.native && TV.native.resume()");
    }

    // while another app is open the home screen sleeps: no animation, no CPU
    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        web.pauseTimers();
    }

    @Override
    protected void onDestroy() {
        if (packageReceiver != null) unregisterReceiver(packageReceiver);
        web.destroy();
        super.onDestroy();
    }
}
