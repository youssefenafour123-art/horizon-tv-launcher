package com.horizon.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms the next athan after a reboot, an update, or a clock / timezone change. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        AthanScheduler.reschedule(c);
    }
}
