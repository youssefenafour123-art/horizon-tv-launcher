package com.horizon.launcher;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps exactly one system alarm armed: the next athan.
 * The page computes the coming days' times (same engine as the UI) and hands them over;
 * after each athan, on boot, and on clock changes, the next one is armed from that list.
 */
final class AthanScheduler {
    private static final String PREFS = "athan";

    static void save(Context c, String list, float volume) {
        prefs(c).edit().putString("list", list).putFloat("vol", volume).apply();
    }

    static float volume(Context c) { return prefs(c).getFloat("vol", 1f); }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void reschedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent old = pending(c, null);
        am.cancel(old);

        JSONObject next = next(c);
        if (next == null) return;
        long t = next.optLong("t");
        PendingIntent pi = pending(c, next);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
        } else if (Build.VERSION.SDK_INT >= 21) {
            Intent show = new Intent(c, MainActivity.class);
            PendingIntent showPi = PendingIntent.getActivity(c, 2, show, PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(t, showPi), pi);
        }
    }

    private static JSONObject next(Context c) {
        try {
            JSONArray a = new JSONArray(prefs(c).getString("list", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (o.optLong("t") > now + 1000) return o;
            }
        } catch (Exception ignored) { }
        return null;
    }

    private static PendingIntent pending(Context c, JSONObject o) {
        Intent i = new Intent(c, AlarmReceiver.class);
        if (o != null) {
            i.putExtra("k", o.optString("k")).putExtra("n", o.optString("n")).putExtra("ar", o.optString("ar"))
             .putExtra("time", o.optString("time")).putExtra("city", o.optString("city")).putExtra("t", o.optLong("t"));
        }
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
