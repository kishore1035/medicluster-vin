package com.medicluster.smssender;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;

public final class MainActivity extends Activity {
    private EditText server;
    private EditText key;
    private TextView status;
    private Button start;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            status.setText(getSharedPreferences("status", MODE_PRIVATE).getString("message", "Stopped. Enter server URL and sender key."));
            boolean running = SenderService.isRunning();
            start.setEnabled(!running);
            server.setEnabled(!running);
            key.setEnabled(!running);
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        if (!SenderService.isRunning()) SenderService.status(this, "Stopped. Enter settings, then tap Start sender.");
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding, padding, padding);
        layout.setBackgroundColor(Color.rgb(244, 242, 236));
        scroll.addView(layout);
        text(layout, "MediCluster", 18);
        text(layout, "SMS sender", 34);
        text(layout, "Send patient sign-in codes using this phone’s default SMS SIM. Carrier charges and SMS limits apply.", 16);
        text(layout, "Server URL", 14);
        server = new EditText(this);
        server.setSingleLine(true);
        server.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        server.setHint("https://your-clinic.example");
        server.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        layout.addView(server);
        text(layout, "Sender key", 14);
        key = new EditText(this);
        key.setSingleLine(true);
        key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setHint("Paste key from local setup file");
        key.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        layout.addView(key);
        try {
            Credentials saved = Credentials.load(this);
            if (saved != null) { server.setText(saved.origin); key.setText(saved.token); }
        } catch (Exception exception) { SenderService.status(this, "Saved key unavailable. Enter settings again."); }
        start = new Button(this);
        start.setText(R.string.start_sender);
        start.setOnClickListener(view -> begin());
        layout.addView(start);
        Button stop = new Button(this);
        stop.setText(R.string.stop_sender);
        stop.setOnClickListener(view -> {
            stopService(new Intent(this, SenderService.class));
            SenderService.status(this, "Stopped. No new messages will be sent.");
        });
        layout.addView(stop);
        status = text(layout, "", 16);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        text(layout, "Keep phone charged and connected to internet and mobile network. Set default SMS SIM in phone settings before starting.", 14);
        if (BuildConfig.DEBUG) text(layout, "Local testing: HTTP is allowed only for private network IP addresses. Use same network as backend.", 14);
        setContentView(scroll);
    }

    private TextView text(LinearLayout parent, String value, int size) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(Color.rgb(26, 29, 31));
        view.setPadding(0, 16, 0, 12);
        parent.addView(view);
        return view;
    }

    private void begin() {
        try {
            new Credentials(server.getText().toString(), key.getText().toString()).save(this);
            ArrayList<String> permissions = new ArrayList<>();
            if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) permissions.add(Manifest.permission.SEND_SMS);
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
            if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), 1);
            else startForegroundService(new Intent(this, SenderService.class));
        } catch (Exception exception) {
            SenderService.status(this, exception.getMessage() == null ? "Could not save sender settings." : exception.getMessage());
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != 1) return;
        if (checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
            startForegroundService(new Intent(this, SenderService.class));
        } else SenderService.status(this, "SMS permission denied. Sender remains stopped.");
    }

    @Override protected void onResume() { super.onResume(); handler.post(refresh); }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
}
