package com.medicluster.smssender;

import org.junit.Test;
import static org.junit.Assert.*;

public class SenderPolicyTest {
    @Test public void httpsOriginsCannotRedirectCredentialsToAnotherPath() {
        assertEquals("https://clinic.example", SenderPolicy.origin("https://clinic.example/", false));
        for (String url : new String[]{"https://user:secret@clinic.example", "https://clinic.example/api", "https://clinic.example?x=y", "https://clinic.example#fragment", "file:///tmp", "http://clinic.example"}) {
            assertThrows(IllegalArgumentException.class, () -> SenderPolicy.origin(url, false));
        }
    }
    @Test public void localHttpOnlyWorksInDebugBuilds() {
        assertEquals("http://192.168.1.4:5000", SenderPolicy.origin("http://192.168.1.4:5000", true));
        assertEquals("http://10.0.2.2:5000", SenderPolicy.origin("http://10.0.2.2:5000", true));
        assertThrows(IllegalArgumentException.class, () -> SenderPolicy.origin("http://192.168.1.4:5000", false));
        assertThrows(IllegalArgumentException.class, () -> SenderPolicy.origin("http://public.example", true));
        assertThrows(IllegalArgumentException.class, () -> SenderPolicy.origin("http://192.168.1.4.evil.example", true));
    }
    @Test public void staleAndMalformedJobsCannotSendSms() {
        String text = "Your MediCluster sign-in code is 123456. Expires in 5 minutes. Do not share this code.";
        assertTrue(SenderPolicy.canSend("0123456789abcdef01234567", "+919000000001", text, 61_000, 1000));
        assertFalse(SenderPolicy.canSend("0123456789abcdef01234567", "+919000000001", text, 1000, 1000));
        assertFalse(SenderPolicy.canSend("0123456789abcdef01234567", "1900", text, 61_000, 1000));
        assertFalse(SenderPolicy.canSend("0123456789abcdef01234567", "+919000000001", "Send arbitrary bulk messages", 61_000, 1000));
        assertFalse(SenderPolicy.canSend("wrong", "+919000000001", text, 61_000, 1000));
    }
    @Test public void interruptedSendsNeverAutomaticallyRetry() {
        assertEquals("failed", SenderPolicy.recover("sending"));
        assertEquals("sent", SenderPolicy.recover("sent"));
        assertEquals("failed", SenderPolicy.recover("failed"));
    }
    @Test public void ambiguousDefaultSimCannotBeUsedForSending() {
        assertTrue(SenderPolicy.validSubscriptionId(0));
        assertTrue(SenderPolicy.validSubscriptionId(1));
        assertFalse(SenderPolicy.validSubscriptionId(-1));
        assertFalse(SenderPolicy.validSubscriptionId(Integer.MAX_VALUE));
    }
}
