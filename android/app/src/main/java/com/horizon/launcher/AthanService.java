package com.horizon.launcher;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Plays the athan in the foreground (pausing whatever is on screen) and shows the athan screen on top. */
public class AthanService extends Service {
    static final String STOP = "stop";
    private static final String CHANNEL = "athan";
    static volatile AthanService instance;

    private MediaPlayer player;
    private AudioManager audio;
    private AudioFocusRequest focus;
    Intent info;

    static void start(Context c, String key, String name, String ar, String time, String city) {
        Intent i = new Intent(c, AthanService.class)
                .putExtra("k", key).putExtra("n", name).putExtra("ar", ar).putExtra("time", time).putExtra("city", city);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void stop(Context c) {
        c.startService(new Intent(c, AthanService.class).setAction(STOP));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || STOP.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        info = intent;
        instance = this;
        goForeground(intent);
        play();
        showScreen(intent);
        return START_NOT_STICKY;
    }

    private void goForeground(Intent i) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Intent open = new Intent(this, AthanActivity.class).putExtras(i).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Athan", NotificationManager.IMPORTANCE_HIGH));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        Notification n = b.setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("Athan · " + i.getStringExtra("n"))
                .setContentText(i.getStringExtra("ar"))
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
    }

    private void play() {
        release();
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        // ask other apps (Netflix, YouTube…) to pause while the athan plays
        if (Build.VERSION.SDK_INT >= 26) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attrs).build();
            audio.requestAudioFocus(focus);
        } else {
            audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        try (AssetFileDescriptor fd = getAssets().openFd("web/assets/athan.mp3")) {
            player = new MediaPlayer();
            player.setAudioAttributes(attrs);
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            player.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            float v = AthanScheduler.volume(this);
            player.setVolume(v, v);
            player.setOnCompletionListener(mp -> stopSelf());
            player.prepare();
            player.start();
        } catch (Exception e) {
            stopSelf();
        }
    }

    private void showScreen(Intent i) {
        try {
            startActivity(new Intent(this, AthanActivity.class).putExtras(i).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { /* without "display over apps" the sound still plays */ }
    }

    /** 0..1 for the progress line on the athan screen */
    float progress() {
        try { return player == null ? 0 : player.getCurrentPosition() / (float) Math.max(1, player.getDuration()); }
        catch (Exception e) { return 0; }
    }

    private void release() {
        if (player != null) { try { player.stop(); } catch (Exception ignored) { } player.release(); player = null; }
        if (audio != null) {
            if (Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
            else audio.abandonAudioFocus(null);
        }
    }

    @Override
    public void onDestroy() {
        release();
        instance = null;
        AthanActivity.closeIfOpen();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
