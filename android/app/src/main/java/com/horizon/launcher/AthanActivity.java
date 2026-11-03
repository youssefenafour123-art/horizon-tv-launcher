package com.horizon.launcher;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen athan: prayer name in Arabic, time and city, a progress line. Any remote button stops it. */
public class AthanActivity extends Activity {
    private static AthanActivity open;
    private final Handler tick = new Handler(Looper.getMainLooper());
    private View bar;

    static void closeIfOpen() {
        AthanActivity a = open;
        if (a != null) a.runOnUiThread(a::finish);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        open = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }

        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xF0101632, 0xF2080A18, 0xF8040610});
        root.setBackground(bg);
        root.setAlpha(0f);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);

        col.addView(text("حان الآن موعد أذان", 18, 0xBFFFFFFF, Typeface.NORMAL));
        col.addView(text(getIntent().getStringExtra("ar"), 96, 0xFFFFFFFF, Typeface.BOLD));
        col.addView(text("It's time for " + getIntent().getStringExtra("n"), 26, 0xFFFFFFFF, Typeface.NORMAL));
        col.addView(text(getIntent().getStringExtra("time") + "  ·  " + getIntent().getStringExtra("city"), 15, 0xBFFFFFFF, Typeface.NORMAL));

        FrameLayout track = new FrameLayout(this);
        GradientDrawable tr = new GradientDrawable(); tr.setColor(0x29FFFFFF); tr.setCornerRadius(dp(2));
        track.setBackground(tr);
        bar = new View(this);
        GradientDrawable br = new GradientDrawable(); br.setColor(0xFFFFD67E); br.setCornerRadius(dp(2));
        bar.setBackground(br);
        bar.setPivotX(0); bar.setScaleX(0);
        track.addView(bar, new FrameLayout.LayoutParams(dp(240), dp(3)));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(dp(240), dp(3));
        tp.topMargin = dp(28);
        col.addView(track, tp);

        root.addView(col, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        TextView hint = text("PRESS ANY BUTTON TO STOP", 11, 0x80FFFFFF, Typeface.NORMAL);
        hint.setLetterSpacing(0.24f);
        FrameLayout.LayoutParams hp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM);
        hp.bottomMargin = dp(40);
        root.addView(hint, hp);

        setContentView(root);
        root.animate().alpha(1f).setDuration(700).start();
        col.setTranslationY(dp(16));
        col.animate().translationY(0).setDuration(900).start();

        tick.post(new Runnable() {
            @Override public void run() {
                AthanService s = AthanService.instance;
                if (s != null) bar.setScaleX(s.progress());
                tick.postDelayed(this, 500);
            }
        });
    }

    private TextView text(String s, int sp, int color, int style) {
        TextView t = new TextView(this);
        t.setText(s == null ? "" : s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create("sans-serif-light", style));
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(2), 0, dp(2));
        return t;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        // volume keys keep working; every other button stops the athan
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_MUTE) return super.onKeyDown(code, e);
        AthanService.stop(this);
        finish();
        return true;
    }

    @Override
    protected void onDestroy() {
        tick.removeCallbacksAndMessages(null);
        if (open == this) open = null;
        super.onDestroy();
    }
}
