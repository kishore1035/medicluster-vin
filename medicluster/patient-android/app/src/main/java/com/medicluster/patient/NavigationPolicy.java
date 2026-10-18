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

    boolean isGoogleAuthStart(String url) {
        URI uri = trustedUri(url);
        if (uri == null || !"/api/patient-auth/google/start".equals(uri.getRawPath())
                || uri.getRawFragment() != null) return false;
        String query = uri.getRawQuery();
        return query != null && (query.matches("platform=android&handoff_challenge=[A-Za-z0-9_-]{43}")
                || query.matches("handoff_challenge=[A-Za-z0-9_-]{43}&platform=android"));
    }

    String patientUrlFromGoogleReturn(String url) {
        if (url == null) return null;
        try {
            URI uri = new URI(url);
            if (!"mediclusterpatient".equals(uri.getScheme())
                    || !"google-return".equals(uri.getHost())
                    || !"google-return".equals(uri.getRawAuthority())
                    || uri.getRawUserInfo() != null || uri.getPort() != -1
                    || uri.getRawFragment() != null
                    || !("".equals(uri.getRawPath()) || "/".equals(uri.getRawPath()))) return null;
            String query = uri.getRawQuery();
            if (query == null) return null;
            String appUrl = origin.resolve("/app").toString();
            if (query.matches("code=[0-9a-fA-F]{64}")) {
                return appUrl + "?patient_auth_code=" + query.substring("code=".length());
            }
            if (query.matches("error=(google_cancelled|google_failed|patient_not_linked|google_email_unverified|google_email_not_authoritative|google_identity_conflict|google_not_configured)")) {
                return appUrl + "?auth_error=" + query.substring("error=".length());
            }
        } catch (URISyntaxException | IllegalArgumentException e) {
            return null;
        }
        return null;
    }
}
