package com.medicluster.smssender;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class GatewayClient {
    static final class ApiException extends Exception {
        final int status;
        ApiException(int status) {
            super(status == 401 ? "Sender key rejected. Check settings." : "Server unavailable (HTTP " + status + ").");
            this.status = status;
        }
    }

    private final Credentials credentials;
    GatewayClient(Credentials credentials) { this.credentials = credentials; }

    JSONObject post(String path, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(credentials.origin + "/api/sms-gateway" + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        connection.setRequestProperty("Authorization", "Bearer " + credentials.token);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);
        try {
            byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(data.length);
            try (OutputStream stream = connection.getOutputStream()) { stream.write(data); }
            int status = connection.getResponseCode();
            if (status != 200) throw new ApiException(status);
            try (InputStream stream = connection.getInputStream(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[512];
                int count;
                while ((count = stream.read(chunk)) != -1) {
                    if (buffer.size() + count > 8192) throw new IllegalStateException("Invalid server response.");
                    buffer.write(chunk, 0, count);
                }
                return new JSONObject(buffer.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { connection.disconnect(); }
    }
}
