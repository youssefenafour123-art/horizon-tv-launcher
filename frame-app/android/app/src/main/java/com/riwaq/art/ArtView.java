package com.riwaq.art;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
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

/** The Riwaq page in a WebView, served from the APK's assets under a secure origin. Shared by the app and the screensaver. */
final class ArtView {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/web/index.html";

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "application/javascript"); MIME.put("css", "text/css");
        MIME.put("jpg", "image/jpeg"); MIME.put("png", "image/png"); MIME.put("svg", "image/svg+xml");
        MIME.put("woff2", "font/woff2"); MIME.put("mp4", "video/mp4"); MIME.put("json", "application/json");
    }

    interface OnGone { void gone(); }

    static WebView create(Context c, String query, Object bridge, OnGone onGone) {
        WebView web = new WebView(c);
        web.setBackgroundColor(Color.rgb(10, 26, 27));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (bridge != null) web.addJavascriptInterface(bridge, "RiwaqNative");

        final AssetManager assets = c.getAssets();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return blocked(); // everything Riwaq needs is inside the APK
                return serve(assets, u);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) { return true; }

            // the page's process was killed for memory: rebuild instead of crashing
            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail d) {
                android.util.Log.w("Riwaq", "renderer gone");
                if (view.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                if (onGone != null) onGone.gone();
                return true;
            }
        });
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                android.util.Log.d("Riwaq", m.message() + " @" + m.lineNumber());
                return true;
            }
        });
        web.loadUrl(START + (query == null ? "" : query));
        return web;
    }

    private static WebResourceResponse serve(AssetManager assets, Uri u) {
        String path = u.getPath() == null ? "" : u.getPath();
        try {
            String asset = path.substring(1);
            String ext = asset.substring(asset.lastIndexOf('.') + 1).toLowerCase();
            InputStream in = assets.open(asset);
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text") || mime.endsWith("javascript") ? "utf-8" : null, in);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "max-age=31536000");
            h.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            r.setStatusCodeAndReasonPhrase(404, "Not found");
            return r;
        }
    }

    private static WebResourceResponse blocked() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(403, "Offline app");
        return r;
    }

    static void sleep(WebView web) {
        if (web == null) return;
        web.evaluateJavascript("window.RiwaqApp && RiwaqApp.sleep()", null);
        web.onPause();
        web.pauseTimers();
    }

    static void wake(WebView web) {
        if (web == null) return;
        web.onResume();
        web.resumeTimers();
        web.evaluateJavascript("window.RiwaqApp && RiwaqApp.wake()", null);
    }
}
