package com.horizon.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires at prayer time: plays the athan (unless the TV was off and it is long past), then arms the next one. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        long late = System.currentTimeMillis() - i.getLongExtra("t", 0);
        if (late < 10 * 60 * 1000) {
            AthanService.start(c, i.getStringExtra("k"), i.getStringExtra("n"), i.getStringExtra("ar"),
                    i.getStringExtra("time"), i.getStringExtra("city"));
        }
        AthanScheduler.reschedule(c);
    }
}
