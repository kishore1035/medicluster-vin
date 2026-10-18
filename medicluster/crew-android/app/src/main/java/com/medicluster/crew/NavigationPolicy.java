package com.medicluster.crew;

import java.net.URI;
import java.net.URISyntaxException;

/** Navigation restrictions complement the crew roles enforced by Supabase. */
final class NavigationPolicy {
    private final URI origin;

    NavigationPolicy(String origin) { this.origin = URI.create(origin); }

    private URI trustedUri(String url) {
        if (url == null) return null;
        try {
            URI uri = new URI(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null
                    || !origin.getHost().equalsIgnoreCase(uri.getHost())
                    || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            return uri;
        } catch (URISyntaxException | IllegalArgumentException e) { return null; }
    }

    private boolean rootPath(URI uri) {
        return "".equals(uri.getRawPath()) || "/".equals(uri.getRawPath());
    }

    boolean isCrewPage(String url) {
        URI uri = trustedUri(url);
        return uri != null && rootPath(uri) && uri.getRawQuery() == null
                && ("/driver".equals(uri.getRawFragment()) || "/driver/login".equals(uri.getRawFragment()));
    }

    boolean isTrustedOrigin(String url) {
        URI uri = trustedUri(url);
        return uri != null && rootPath(uri) && uri.getRawQuery() == null && uri.getRawFragment() == null;
    }

    boolean canUseLocation(String requestOrigin, String pageUrl) {
        return isTrustedOrigin(requestOrigin) && isCrewPage(pageUrl);
    }

    boolean isExternalLink(String url) {
        if (url == null) return false;
        if (url.matches("tel:\\+?[0-9][0-9()-]{0,30}")) return true;
        try {
            URI uri = new URI(url);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                    && uri.getRawUserInfo() == null && !origin.getHost().equalsIgnoreCase(uri.getHost());
        } catch (URISyntaxException | IllegalArgumentException e) { return false; }
    }
}
