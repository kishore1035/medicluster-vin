package com.medicluster.smssender;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.telephony.SmsManager;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public final class SenderService extends Service {
    private static final String CHANNEL = "sms-sender";
    private static volatile boolean active;
    private ScheduledExecutorService worker;
    private PowerManager.WakeLock wakeLock;
    private long wakeRenewed;
    private volatile boolean stopping;
    private Credentials credentials;
    private GatewayClient client;

    static boolean isRunning() { return active; }

    static void status(Context context, String message) {
        context.getSharedPreferences("status", MODE_PRIVATE).edit().putString("message", message).apply();
    }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "SMS sender", NotificationManager.IMPORTANCE_LOW));
        Intent stop = new Intent(this, SenderService.class).setAction("STOP");
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle("MediCluster SMS sender").setContentText("Sending requested patient sign-in codes using your SIM.")
                .setContentIntent(open).setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Stop", stopIntent).build()).build();
        startForeground(1, notification);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (worker != null) return START_NOT_STICKY;
        try {
            credentials = Credentials.load(this);
            if (credentials == null) throw new IllegalStateException("Enter server URL and sender key first.");
            if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                throw new IllegalStateException("SMS permission is required.");
            }
            if (!SenderPolicy.validSubscriptionId(SmsManager.getDefaultSmsSubscriptionId())) {
                throw new IllegalStateException("Choose default SMS SIM in phone settings, then start again.");
            }
            SendJournal.recover(this);
            client = new GatewayClient(credentials);
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MediCluster:SmsSender");
            renewWakeLock();
            worker = Executors.newSingleThreadScheduledExecutor();
            active = true;
            worker.scheduleWithFixedDelay(this::tick, 0, 3, TimeUnit.SECONDS);
            status(this, "Connecting to MediCluster…");
        } catch (Exception exception) {
            status(this, exception.getMessage() == null ? "Could not start sender." : exception.getMessage());
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void renewWakeLock() {
        if (wakeLock.isHeld()) wakeLock.release();
        wakeLock.acquire(20 * 60_000L);
        wakeRenewed = SystemClock.elapsedRealtime();
    }

    private void tick() {
        if (stopping) return;
        try {
            if (SystemClock.elapsedRealtime() - wakeRenewed > 10 * 60_000L) renewWakeLock();
            JSONObject pending = SendJournal.load(this);
            if (pending != null) {
                if (!pending.getString("binding").equals(SendJournal.binding(credentials))) {
                    status(this, "Pending result belongs to previous settings. Restore those settings first.");
                    stopSelf();
                    return;
                }
                client.post("/heartbeat", new JSONObject());
                if (pending.getString("status").equals("sending")) {
                    if (System.currentTimeMillis() - pending.getLong("startedAt") > 60_000) {
                        SendJournal.finish(this, pending.getString("id"), "failed", -2);
                    }
                    return;
                }
                try {
                    client.post("/jobs/" + pending.getString("id") + "/result", new JSONObject()
                            .put("status", pending.getString("status")).put("errorCode", pending.optInt("errorCode", -2)));
                    status(this, pending.getString("status").equals("sent")
                            ? "Last code sent to mobile network. Waiting for requests." : "Last SMS failed or result unknown. Patient can request another code.");
                } catch (GatewayClient.ApiException exception) {
                    if (exception.status != 404 && exception.status != 409) throw exception;
                    status(this, "Previous result expired. Waiting for requests.");
                }
                SendJournal.clear(this);
            }
            if (stopping) return;
            JSONObject response = client.post("/claim", new JSONObject());
            if (response.isNull("job")) {
                if (pending == null) status(this, "Connected. Waiting for code requests.");
                return;
            }
            JSONObject job = response.getJSONObject("job");
            String id = job.getString("id");
            String mobile = job.getString("mobile");
            String message = job.getString("message");
            long expiresAt = Instant.parse(job.getString("expiresAt")).toEpochMilli();
            SendJournal.begin(this, id, expiresAt, credentials);
            if (stopping || !SenderPolicy.canSend(id, mobile, message, expiresAt, System.currentTimeMillis())) {
                SendJournal.finish(this, id, "failed", -3);
                return;
            }
            try {
                int subscriptionId = SmsManager.getDefaultSmsSubscriptionId();
                if (!SenderPolicy.validSubscriptionId(subscriptionId)) throw new IllegalStateException("No default SMS SIM.");
                SmsManager manager = SmsManager.getSmsManagerForSubscriptionId(subscriptionId);
                Intent result = new Intent(this, SmsSentReceiver.class).setAction("com.medicluster.smssender.SENT." + id).putExtra("jobId", id);
                PendingIntent sent = PendingIntent.getBroadcast(this, 0, result, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                manager.sendTextMessage(mobile, null, message, sent, null);
                status(this, "Sending requested code…");
            } catch (RuntimeException exception) {
                SendJournal.finish(this, id, "failed", -3);
                status(this, "Could not send SMS. Check SIM and SMS permission.");
            }
        } catch (GatewayClient.ApiException exception) {
            status(this, exception.getMessage());
            if (exception.status == 401) stopSelf();
        } catch (Exception exception) {
            status(this, "Connection interrupted. Retrying; SMS will not be sent twice.");
        }
    }

    @Override public void onDestroy() {
        stopping = true;
        active = false;
        if (worker != null) worker.shutdownNow();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
