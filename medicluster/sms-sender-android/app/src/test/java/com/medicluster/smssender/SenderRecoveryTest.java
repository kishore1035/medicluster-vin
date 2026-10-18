package com.medicluster.smssender;

import android.content.Context;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class SenderRecoveryTest {
    @Test public void staleRunningFlagAfterProcessDeathCannotBlockRestart() {
        Context context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("status", Context.MODE_PRIVATE).edit().putBoolean("running", true).commit();
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            shadowOf(Looper.getMainLooper()).idle();
            Button start = findStart(controller.get().getWindow().getDecorView());
            assertNotNull(start);
            assertTrue("Phone operator must be able to restart after process death", start.isEnabled());
        }
    }

    @Test public void persistedInterruptedSendBecomesFailedWithoutReturningToSendableState() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        SendJournal.clear(context);
        Credentials credentials = new Credentials("https://clinic.example", "test-token-with-at-least-32-characters");
        SendJournal.begin(context, "0123456789abcdef01234567", System.currentTimeMillis() + 60_000, credentials);
        assertEquals("sending", SendJournal.load(context).getString("status"));
        SendJournal.recover(context);
        JSONObject recovered = SendJournal.load(context);
        assertEquals("failed", recovered.getString("status"));
        assertEquals(-2, recovered.getInt("errorCode"));
        assertThrows(IllegalStateException.class, () -> SendJournal.begin(context, "abcdef0123456789abcdef01", System.currentTimeMillis() + 60_000, credentials));
        SendJournal.clear(context);
        assertNull(SendJournal.load(context));
    }

    @Test public void duplicateOrLateCallbacksCannotChangeRecordedSmsResult() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        SendJournal.clear(context);
        String id = "0123456789abcdef01234567";
        Credentials credentials = new Credentials("https://clinic.example", "test-token-with-at-least-32-characters");
        SendJournal.begin(context, id, System.currentTimeMillis() + 60_000, credentials);
        SendJournal.finish(context, "abcdef0123456789abcdef01", "sent", -1);
        assertEquals("sending", SendJournal.load(context).getString("status"));
        SendJournal.finish(context, id, "sent", -1);
        SendJournal.finish(context, id, "failed", 1);
        SendJournal.recover(context);
        assertEquals("sent", SendJournal.load(context).getString("status"));
        SendJournal.clear(context);
    }

    private Button findStart(View view) {
        if (view instanceof Button && ((Button) view).getText().toString().equals("Start sender")) return (Button) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                Button found = findStart(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
}
