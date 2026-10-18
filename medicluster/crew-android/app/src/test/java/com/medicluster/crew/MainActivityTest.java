package com.medicluster.crew;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.widget.Button;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class MainActivityTest {
    private static final String ORIGIN = BuildConfig.CREW_ORIGIN;

    @Test public void launcherIgnoresExternalIntentAndKeepsCrewSessionInOwnWebView() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://evil.test/#/driver"));
        try (var controller = Robolectric.buildActivity(MainActivity.class, intent).setup()) {
            WebView web = findWeb(controller.get().getWindow().getDecorView());
            assertNotNull(web);
            assertEquals(ORIGIN + "/#/driver/login", shadowOf(web).getLastLoadedUrl());
            assertTrue(web.getSettings().getJavaScriptEnabled());
            assertTrue(web.getSettings().getDomStorageEnabled());
            assertFalse(web.getSettings().getAllowFileAccess());
            assertFalse(web.getSettings().getAllowContentAccess());
            assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, web.getSettings().getMixedContentMode());
            assertTrue(web.getSettings().getUserAgentString().contains("MediClusterCrew/"));
        }
    }
    @Test public void savedDispatcherUrlCannotReplaceCrewEntry() {
        Bundle saved = new Bundle(); saved.putString("crewUrl", ORIGIN + "/#/login");
        try (var controller = Robolectric.buildActivity(MainActivity.class).create(saved).start().resume().visible()) {
            assertEquals(ORIGIN + "/#/driver/login", shadowOf(findWeb(controller.get().getWindow().getDecorView())).getLastLoadedUrl());
        }
    }
    @Test public void validCrewUrlRestoresAfterRecreation() {
        Bundle saved = new Bundle(); saved.putString("crewUrl", ORIGIN + "/#/driver");
        try (var controller = Robolectric.buildActivity(MainActivity.class).create(saved).start().resume().visible()) {
            assertEquals(ORIGIN + "/#/driver", shadowOf(findWeb(controller.get().getWindow().getDecorView())).getLastLoadedUrl());
        }
    }
    @Test public void otherOriginsCannotAskForLocation() {
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            WebView web = findWeb(controller.get().getWindow().getDecorView());
            AtomicReference<Boolean> granted = new AtomicReference<>();
            shadowOf(web).getWebChromeClient().onGeolocationPermissionsShowPrompt("https://evil.test", (origin, allow, retain) -> granted.set(allow));
            assertEquals(Boolean.FALSE, granted.get());
        }
    }
    @Test public void androidPermissionDialogDoesNotCancelPendingLocationConsent() {
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            WebView web = findWeb(activity.getWindow().getDecorView());
            AtomicReference<Boolean> granted = new AtomicReference<>();
            shadowOf(web).getWebChromeClient().onGeolocationPermissionsShowPrompt(ORIGIN, (origin, allow, retain) -> granted.set(allow));
            assertNull(granted.get());
            controller.pause();
            assertNull("A permission dialog may pause the activity", granted.get());
            shadowOf(activity.getApplication()).grantPermissions(Manifest.permission.ACCESS_COARSE_LOCATION);
            controller.resume();
            activity.onRequestPermissionsResult(101, new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, new int[]{PackageManager.PERMISSION_GRANTED});
            assertEquals(Boolean.TRUE, granted.get());
        }
    }
    @Test public void permissionResultRechecksPageAfterNavigation() {
        try (var controller = Robolectric.buildActivity(MainActivity.class).setup()) {
            MainActivity activity = controller.get();
            WebView web = findWeb(activity.getWindow().getDecorView());
            AtomicReference<Boolean> granted = new AtomicReference<>();
            shadowOf(web).getWebChromeClient().onGeolocationPermissionsShowPrompt(ORIGIN, (origin, allow, retain) -> granted.set(allow));
            web.loadUrl(ORIGIN + "/#/login");
            shadowOf(activity.getApplication()).grantPermissions(Manifest.permission.ACCESS_COARSE_LOCATION);
            activity.onRequestPermissionsResult(101, new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, new int[]{PackageManager.PERMISSION_GRANTED});
            assertEquals(Boolean.FALSE, granted.get());
        }
    }
    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView web = findWeb(group.getChildAt(i));
                if (web != null) return web;
            }
        }
        return null;
    }
}
