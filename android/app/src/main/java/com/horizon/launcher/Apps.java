package com.horizon.launcher;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.util.LruCache;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Installed apps: list, real banners/icons as PNG, brand color, launch. */
final class Apps {
    private static final LruCache<String, byte[]> images = new LruCache<String, byte[]>(6 * 1024 * 1024) {
        @Override protected int sizeOf(String k, byte[] v) { return v.length; }
    };

    private static String listCache;

    static void clearCache() { images.evictAll(); listCache = null; }

    private static Map<String, ActivityInfo> launchable(Context c) {
        PackageManager pm = c.getPackageManager();
        Map<String, ActivityInfo> out = new LinkedHashMap<>();
        for (String cat : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(cat);
            for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(c.getPackageName()) || out.containsKey(pkg)) continue;
                out.put(pkg, ri.activityInfo);
            }
        }
        return out;
    }

    static synchronized String list(Context c) {
        if (listCache != null) return listCache;
        PackageManager pm = c.getPackageManager();
        List<JSONObject> rows = new ArrayList<>();
        for (Map.Entry<String, ActivityInfo> e : launchable(c).entrySet()) {
            try {
                ActivityInfo ai = e.getValue();
                JSONObject o = new JSONObject();
                o.put("pkg", e.getKey());
                o.put("label", String.valueOf(ai.loadLabel(pm)));
                o.put("banner", banner(pm, ai) != null);
                o.put("color", hex(brandColor(ai.loadIcon(pm))));
                rows.add(o);
            } catch (Exception ignored) { }
        }
        // apps with TV banners first, then alphabetical
        Collections.sort(rows, (a, b) -> {
            int ba = a.optBoolean("banner") ? 0 : 1, bb = b.optBoolean("banner") ? 0 : 1;
            return ba != bb ? ba - bb : a.optString("label").compareToIgnoreCase(b.optString("label"));
        });
        listCache = new JSONArray(rows).toString();
        return listCache;
    }

    /** the app's TV banner, or null when it has none or ships an empty / transparent one */
    private static Drawable banner(PackageManager pm, ActivityInfo ai) {
        Drawable d = ai.loadBanner(pm);
        if (d == null) d = ai.applicationInfo.loadBanner(pm);
        if (d == null) return null;
        Bitmap probe = render(d, 64, 36);
        int solid = 0, lo = 255, hi = 0;
        for (int y = 0; y < 36; y += 2) for (int x = 0; x < 64; x += 2) {
            int p = probe.getPixel(x, y);
            if (Color.alpha(p) <= 40) continue;
            solid++;
            int lum = (Color.red(p) * 3 + Color.green(p) * 6 + Color.blue(p)) / 10;
            lo = Math.min(lo, lum); hi = Math.max(hi, lum);
        }
        // mostly transparent, or one flat color (placeholder banner): use the icon instead
        return solid > 64 * 36 / 4 * 0.4 && hi - lo > 14 ? d : null;
    }

    static byte[] image(Context c, String pkg, boolean wantBanner) {
        String key = pkg + (wantBanner ? "#b" : "#i");
        byte[] hit = images.get(key);
        if (hit != null) return hit;
        ActivityInfo ai = launchable(c).get(pkg);
        if (ai == null) return null;
        PackageManager pm = c.getPackageManager();
        Drawable d = wantBanner ? banner(pm, ai) : null;
        Bitmap bmp = d != null ? render(d, 480, 270) : render(ai.loadIcon(pm), 192, 192);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        byte[] png = out.toByteArray();
        images.put(key, png);
        return png;
    }

    private static Bitmap render(Drawable d, int w, int h) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        d.setBounds(0, 0, w, h);
        d.draw(cv);
        return b;
    }

    /** most saturated average of the icon: used for the card color and its glowing edge */
    private static int brandColor(Drawable icon) {
        Bitmap b = render(icon, 32, 32);
        double r = 0, g = 0, bl = 0, wsum = 0;
        float[] hsv = new float[3];
        for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) {
            int p = b.getPixel(x, y);
            if (Color.alpha(p) < 128) continue;
            Color.colorToHSV(p, hsv);
            double w = 0.05 + hsv[1] * hsv[2];
            r += Color.red(p) * w; g += Color.green(p) * w; bl += Color.blue(p) * w; wsum += w;
        }
        if (wsum == 0) return Color.rgb(140, 150, 170);
        return Color.rgb((int) (r / wsum), (int) (g / wsum), (int) (bl / wsum));
    }

    private static String hex(int c) { return String.format("#%06x", c & 0xffffff); }

    static boolean launch(Context c, String pkg) {
        PackageManager pm = c.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) return false;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        c.startActivity(i);
        return true;
    }
}
