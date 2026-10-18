package com.medicluster.smssender;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class SmsSentReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            int result = getResultCode();
            SendJournal.finish(context, intent.getStringExtra("jobId"), result == Activity.RESULT_OK ? "sent" : "failed", result);
        } catch (Exception exception) {
            SenderService.status(context, "Could not save SMS result. Stop and check storage.");
        }
    }
}
