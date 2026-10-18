package com.medicluster.smssender;

import java.net.URI;
import java.util.Locale;

public final class SenderPolicy {
    private SenderPolicy() { }

    public static String origin(String input, boolean allowLocalHttp) {
        try {
            URI uri = new URI(input.trim());
            String host = uri.getHost();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || (uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))
                    || (uri.getPort() != -1 && (uri.getPort() < 1 || uri.getPort() > 65535))) {
                throw new IllegalArgumentException();
            }
            if (!scheme.equals("https") && !(scheme.equals("http") && allowLocalHttp && privateHost(host))) {
                throw new IllegalArgumentException();
            }
            return new URI(scheme, null, host, uri.getPort(), null, null, null).toString();
        } catch (Exception exception) {
            throw new IllegalArgumentException("Enter HTTPS server URL. Debug builds also allow a local network IP.");
        }
    }

    private static boolean privateHost(String host) {
        if (host.equals("localhost")) return true;
        if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
        String[] parts = host.split("\\.");
        int[] address = new int[4];
        for (int i = 0; i < 4; i++) {
            address[i] = Integer.parseInt(parts[i]);
            if (address[i] > 255 || (parts[i].length() > 1 && parts[i].startsWith("0"))) return false;
        }
        return address[0] == 10 || address[0] == 127
                || (address[0] == 192 && address[1] == 168)
                || (address[0] == 172 && address[1] >= 16 && address[1] <= 31);
    }

    public static boolean canSend(String id, String mobile, String message, long expiresAt, long now) {
        return id != null && id.matches("[a-fA-F0-9]{24}") && mobile != null && mobile.matches("\\+91[6-9][0-9]{9}")
                && message != null && message.matches("Your MediCluster sign-in code is [0-9]{6}\\. Expires in 5 minutes\\. Do not share this code\\.")
                && expiresAt > now + 5000 && expiresAt <= now + 5 * 60_000;
    }

    public static String recover(String outcome) {
        return "sent".equals(outcome) ? "sent" : "failed";
    }

    public static boolean validSubscriptionId(int subscriptionId) {
        return subscriptionId >= 0 && subscriptionId != Integer.MAX_VALUE;
    }
}
