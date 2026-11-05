package com.horizon.launcher;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Keeps the home screen's process alive while the TV is in standby.
 * Without it, Android treats Horizon as a cached background app and kills it for memory overnight,
 * so every power-on became a slow cold start. A silent foreground service raises its priority.
 */
public class KeepAlive extends Service {
    private static final String CHANNEL = "horizon-ready";

    static void start(Context c) {
        try {
            Intent i = new Intent(c, KeepAlive.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { /* not allowed right now (e.g. started from the background): try again next time */ }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Home screen ready", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this).setPriority(Notification.PRIORITY_MIN);
        }
        Notification n = b.setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("Horizon")
                .setContentText("Home screen ready")
                .setOngoing(true)
                .setShowWhen(false)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(2, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(2, n);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
