package com.medicluster.patient;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int PICK_PHOTO = 100;
    private static final int REQUEST_LOCATION = 101;
    private final NavigationPolicy policy = new NavigationPolicy(BuildConfig.PATIENT_ORIGIN);
    private WebView web;
    private LinearLayout status;
    private TextView message;
    private Button retry;
    private ProgressBar progress;
    private boolean pageFailed;
    private String lastPatientUrl = BuildConfig.PATIENT_ORIGIN + "/app";
    private ValueCallback<Uri[]> photoCallback;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(243, 241, 236));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        status = new LinearLayout(this);
        status.setOrientation(LinearLayout.VERTICAL);
        status.setGravity(Gravity.CENTER);
        status.setPadding(40, 40, 40, 40);
        status.setBackgroundColor(Color.rgb(243, 241, 236));
        progress = new ProgressBar(this);
        status.addView(progress);
        message = new TextView(this);
        message.setGravity(Gravity.CENTER);
        message.setTextSize(18);
        message.setPadding(0, 24, 0, 24);
        status.addView(message);
        retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> web.loadUrl(lastPatientUrl));
        status.addView(retry);
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only user-selected gallery content.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MediClusterPatient/1.0");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl(), request.isForMainFrame());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!policy.isPatientPage(url)) {
                    view.stopLoading();
                    showError();
                    return;
                }
                lastPatientUrl = url;
                pageFailed = false;
                message.setText("Connecting to your clinic…");
                progress.setVisibility(View.VISIBLE);
                retry.setVisibility(View.GONE);
                status.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed && policy.isPatientPage(url)) status.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (photoCallback != null) photoCallback.onReceiveValue(null);
                photoCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                try { startActivityForResult(Intent.createChooser(pick, "Choose a photo"), PICK_PHOTO); }
                catch (ActivityNotFoundException e) {
                    photoCallback.onReceiveValue(null);
                    photoCallback = null;
                    Toast.makeText(MainActivity.this, "No photo picker is available", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!policy.isTrustedOrigin(origin)) { callback.invoke(origin, false, false); return; }
                if (hasLocationPermission()) { callback.invoke(origin, true, false); return; }
                if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
                locationOrigin = origin;
                locationCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            }
        });
        // Always open a patient route; do not restore arbitrary external navigation from saved state.
        if (savedState != null && policy.isPatientPage(savedState.getString("patientUrl"))) {
            lastPatientUrl = savedState.getString("patientUrl");
        }
        web.loadUrl(lastPatientUrl);
    }

    private boolean handleNavigation(Uri uri, boolean mainFrame) {
        String url = uri.toString();
        if (policy.isPatientPage(url)) return false;
        if (!mainFrame) return true;
        String scheme = uri.getScheme();
        // Maps and phone calls leave the patient app. Staff routes on our own host stay blocked.
        boolean externalHttps = "https".equalsIgnoreCase(scheme)
                && uri.getHost() != null && uri.getUserInfo() == null
                && !Uri.parse(BuildConfig.PATIENT_ORIGIN).getHost().equalsIgnoreCase(uri.getHost());
        if (externalHttps || "tel".equalsIgnoreCase(scheme)) {
            try {
                Intent intent = new Intent("tel".equalsIgnoreCase(scheme) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, uri);
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "No app can open this link", Toast.LENGTH_LONG).show();
            }
        }
        return true;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void showError() {
        pageFailed = true;
        message.setText("Can’t connect to your clinic. Check your internet connection and try again. The server may take a minute to wake up.");
        progress.setVisibility(View.GONE);
        retry.setVisibility(View.VISIBLE);
        status.setVisibility(View.VISIBLE);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_LOCATION && locationCallback != null) {
            locationCallback.invoke(locationOrigin, hasLocationPermission(), false);
            locationCallback = null;
            locationOrigin = null;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_PHOTO && photoCallback != null) {
            Uri selected = resultCode == RESULT_OK && data != null ? data.getData() : null;
            // File inputs receive only gallery content, never arbitrary file:// resources.
            photoCallback.onReceiveValue(selected != null && "content".equals(selected.getScheme()) ? new Uri[]{selected} : null);
            photoCallback = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null && policy.isPatientPage(web.getUrl())) state.putString("patientUrl", web.getUrl());
        super.onSaveInstanceState(state);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override protected void onDestroy() {
        if (photoCallback != null) photoCallback.onReceiveValue(null);
        if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
        web.destroy();
        super.onDestroy();
    }
}
