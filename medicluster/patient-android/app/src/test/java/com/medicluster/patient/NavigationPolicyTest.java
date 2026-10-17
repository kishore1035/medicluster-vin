package com.medicluster.patient;

import static org.junit.Assert.*;
import org.junit.Test;

public class NavigationPolicyTest {
    private final NavigationPolicy policy = new NavigationPolicy("https://medicluster-wiu3.onrender.com");

    @Test public void patientPagesStayInsideApp() {
        assertTrue(policy.isPatientPage("https://medicluster-wiu3.onrender.com/app"));
        assertTrue(policy.isPatientPage("https://medicluster-wiu3.onrender.com/app/health?day=2026-10-17"));
        assertTrue(policy.isPatientPage("https://medicluster-wiu3.onrender.com:443/app/cliniq"));
    }

    @Test public void clinicianAndDispatchPagesAreBlocked() {
        for (String path : new String[]{"/", "/login", "/dashboard", "/application", "/api/data", "/app/../login", "/app/%2e%2e/login", "/app/%2F..%2Flogin", "/app//../login"}) {
            assertFalse(path, policy.isPatientPage("https://medicluster-wiu3.onrender.com" + path));
        }
    }

    @Test public void untrustedOriginsAndSchemesAreBlocked() {
        for (String url : new String[]{"http://medicluster-wiu3.onrender.com/app", "https://medicluster-wiu3.onrender.com.evil.test/app", "https://medicluster-wiu3.onrender.com@evil.test/app", "https://medicluster-wiu3.onrender.com:8443/app", "javascript:alert(1)", "file:///app", "intent://app", "not a url", "", null}) {
            assertFalse(String.valueOf(url), policy.isPatientPage(url));
        }
    }

    @Test public void onlyConfiguredOriginReceivesLocationPermission() {
        assertTrue(policy.isTrustedOrigin("https://medicluster-wiu3.onrender.com"));
        assertTrue(policy.isTrustedOrigin("https://medicluster-wiu3.onrender.com/"));
        assertFalse(policy.isTrustedOrigin("https://evil.test"));
        assertFalse(policy.isTrustedOrigin("https://medicluster-wiu3.onrender.com@evil.test"));
    }
}
