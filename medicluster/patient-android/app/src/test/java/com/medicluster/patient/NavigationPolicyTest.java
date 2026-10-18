package com.medicluster.patient;

import static org.junit.Assert.*;
import org.junit.Test;

public class NavigationPolicyTest {
    private static final String ORIGIN = "https://medicluster-wiu3.onrender.com";
    private static final String CHALLENGE = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    private static final String CODE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
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

    @Test public void onlyTrustedGoogleStartWithAndroidChallengeLeavesForBrowser() {
        String path = "/api/patient-auth/google/start";
        assertTrue(policy.isGoogleAuthStart(ORIGIN + path + "?platform=android&handoff_challenge=" + CHALLENGE));
        assertTrue(policy.isGoogleAuthStart(ORIGIN + ":443" + path + "?handoff_challenge=" + CHALLENGE + "&platform=android"));
        assertFalse(policy.isPatientPage(ORIGIN + path + "?platform=android&handoff_challenge=" + CHALLENGE));
        for (String url : new String[]{
                ORIGIN + path, ORIGIN + path + "?platform=web&handoff_challenge=" + CHALLENGE,
                ORIGIN + path + "?platform=android&handoff_challenge=short",
                ORIGIN + path + "?platform=android&handoff_challenge=" + CHALLENGE + "=",
                ORIGIN + path + "?platform=android&handoff_challenge=" + CHALLENGE + "&next=https://evil.test",
                ORIGIN + path + "?platform=android&platform=android&handoff_challenge=" + CHALLENGE,
                ORIGIN + path + "?platform=android&handoff_challenge=" + CHALLENGE + "#fragment",
                ORIGIN + path + "/?platform=android&handoff_challenge=" + CHALLENGE,
                ORIGIN + "/api/patient-auth/google/%73tart?platform=android&handoff_challenge=" + CHALLENGE,
                ORIGIN + "/api/patient-auth/google/callback?code=secret",
                ORIGIN + "/login", ORIGIN + "/api/data",
                "https://medicluster-wiu3.onrender.com.evil.test" + path + "?platform=android&handoff_challenge=" + CHALLENGE,
                "https://medicluster-wiu3.onrender.com@evil.test" + path + "?platform=android&handoff_challenge=" + CHALLENGE,
                "https://evil.test@medicluster-wiu3.onrender.com" + path + "?platform=android&handoff_challenge=" + CHALLENGE,
                "http://medicluster-wiu3.onrender.com" + path + "?platform=android&handoff_challenge=" + CHALLENGE,
                ORIGIN + ":8443" + path + "?platform=android&handoff_challenge=" + CHALLENGE,
                "", null}) {
            assertFalse(String.valueOf(url), policy.isGoogleAuthStart(url));
        }
    }

    @Test public void googleReturnMapsCodeAndKnownErrorsToFixedPatientPage() {
        assertEquals(ORIGIN + "/app?patient_auth_code=" + CODE,
                policy.patientUrlFromGoogleReturn("mediclusterpatient://google-return?code=" + CODE));
        assertEquals(ORIGIN + "/app?patient_auth_code=" + CODE.toUpperCase(),
                policy.patientUrlFromGoogleReturn("mediclusterpatient://google-return/?code=" + CODE.toUpperCase()));
        for (String error : new String[]{"google_cancelled", "google_failed", "patient_not_linked", "google_email_unverified",
                "google_email_not_authoritative", "google_identity_conflict", "google_not_configured"}) {
            assertEquals(ORIGIN + "/app?auth_error=" + error,
                    policy.patientUrlFromGoogleReturn("mediclusterpatient://google-return?error=" + error));
        }
    }

    @Test public void unsafeGoogleReturnsAndTokensAreRejected() {
        for (String url : new String[]{
                "mediclusterpatient://google-return", "mediclusterpatient://google-return?code=",
                "mediclusterpatient://google-return?code=" + CODE.substring(1),
                "mediclusterpatient://google-return?code=" + CODE + "0",
                "mediclusterpatient://google-return?code=" + CODE.substring(1) + "g",
                "mediclusterpatient://google-return?token=eyJhbGciOiJIUzI1NiJ9.payload.signature",
                "mediclusterpatient://google-return?code=" + CODE + "&error=google_failed",
                "mediclusterpatient://google-return?code=" + CODE + "&code=" + CODE,
                "mediclusterpatient://google-return?code=" + CODE + "&redirect=https://evil.test",
                "mediclusterpatient://google-return?%63ode=" + CODE,
                "mediclusterpatient://google-return?code=%30" + CODE.substring(1),
                "mediclusterpatient://google-return?error=unknown",
                "mediclusterpatient://google-return?error=google_failed&token=secret",
                "mediclusterpatient://google-return?code=" + CODE + "#fragment",
                "mediclusterpatient://google-return/path?code=" + CODE,
                "mediclusterpatient://google-return//?code=" + CODE,
                "mediclusterpatient://google-return/%2e?code=" + CODE,
                "mediclusterpatient://google-return.evil.test?code=" + CODE,
                "mediclusterpatient://google-return@evil.test?code=" + CODE,
                "mediclusterpatient://evil.test@google-return?code=" + CODE,
                "mediclusterpatient://google-return:443?code=" + CODE,
                "mediclusterpatient://google-return:?code=" + CODE,
                "https://google-return?code=" + CODE,
                "intent://google-return?code=" + CODE,
                "mediclusterpatient:google-return?code=" + CODE,
                "", "not a url", null}) {
            assertNull(String.valueOf(url), policy.patientUrlFromGoogleReturn(url));
        }
    }
}
