package com.medicluster.patient;

import java.net.URI;
import java.net.URISyntaxException;

/** Restricts top-level navigation; patient API authorization remains on the server. */
final class NavigationPolicy {
    private final URI origin;

    NavigationPolicy(String origin) {
        this.origin = URI.create(origin);
    }

    private URI trustedUri(String url) {
        if (url == null) return null;
        try {
            URI uri = new URI(url);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || !origin.getHost().equalsIgnoreCase(uri.getHost())
                    || uri.getRawUserInfo() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            return uri;
        } catch (URISyntaxException | IllegalArgumentException e) {
            return null;
        }
    }

    boolean isPatientPage(String url) {
        URI uri = trustedUri(url);
        if (uri == null) return false;
        String path = uri.getRawPath();
        if (path == null || path.contains("%") || path.contains("//")
                || !path.equals(uri.normalize().getRawPath())) return false;
        return path.equals("/app") || path.startsWith("/app/");
    }

    boolean isTrustedOrigin(String url) {
        URI uri = trustedUri(url);
        return uri != null && uri.getRawQuery() == null && uri.getRawFragment() == null
                && (uri.getRawPath() == null || uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"));
    }
}
