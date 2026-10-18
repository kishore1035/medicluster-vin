package com.medicluster.crew;

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
    private static final int REQUEST_LOCATION = 101;
    private final NavigationPolicy policy = new NavigationPolicy(BuildConfig.CREW_ORIGIN);
    private WebView web;
    private LinearLayout status;
    private TextView message;
    private Button retry;
    private ProgressBar progress;
    private boolean pageFailed;
    private String lastCrewUrl = BuildConfig.CREW_ORIGIN + "/#/driver/login";
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
        message.setText("Connecting to dispatch…");
        message.setGravity(Gravity.CENTER);
        message.setTextSize(18);
        message.setPadding(0, 24, 0, 24);
        status.addView(message);
        retry = new Button(this);
        retry.setText("Try again");
        retry.setVisibility(View.GONE);
        retry.setOnClickListener(v -> web.loadUrl(lastCrewUrl));
        status.addView(retry);
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MediClusterCrew/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (policy.isCrewPage(url)) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(request.getUrl());
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                cancelLocationRequest();
                if (!policy.isCrewPage(url)) {
                    view.stopLoading();
                    showError();
                    return;
                }
                lastCrewUrl = url;
                pageFailed = false;
                message.setText("Connecting to dispatch…");
                progress.setVisibility(View.VISIBLE);
                retry.setVisibility(View.GONE);
                status.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed && policy.isCrewPage(url)) status.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!policy.canUseLocation(origin, web.getUrl())) { callback.invoke(origin, false, false); return; }
                if (hasLocationPermission()) { callback.invoke(origin, true, false); return; }
                cancelLocationRequest();
                locationOrigin = origin;
                locationCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            }
            @Override public void onGeolocationPermissionsHidePrompt() { cancelLocationRequest(); }
        });
        if (savedState != null && policy.isCrewPage(savedState.getString("crewUrl"))) {
            lastCrewUrl = savedState.getString("crewUrl");
        }
        // Launch intents never provide a URL: this app always enters the crew workspace.
        web.loadUrl(lastCrewUrl);
    }

    private void openExternal(Uri uri) {
        if (!policy.isExternalLink(uri.toString())) return;
        try {
            startActivity(new Intent("tel".equalsIgnoreCase(uri.getScheme()) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_LONG).show();
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void cancelLocationRequest() {
        if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
        locationCallback = null;
        locationOrigin = null;
    }

    private void showError() {
        pageFailed = true;
        message.setText("Can’t connect to dispatch. Check your internet connection and try again. The server may take a minute to wake up.");
        progress.setVisibility(View.GONE);
        retry.setVisibility(View.VISIBLE);
        status.setVisibility(View.VISIBLE);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_LOCATION && locationCallback != null) {
            locationCallback.invoke(locationOrigin,
                    hasLocationPermission() && policy.canUseLocation(locationOrigin, web.getUrl()), false);
            locationCallback = null;
            locationOrigin = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null && policy.isCrewPage(web.getUrl())) state.putString("crewUrl", web.getUrl());
        super.onSaveInstanceState(state);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override protected void onPause() {
        super.onPause();
        // Android permission dialogs can pause this activity; finish consent in the result callback.
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override protected void onDestroy() {
        cancelLocationRequest();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
