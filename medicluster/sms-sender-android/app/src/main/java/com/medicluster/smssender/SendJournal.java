package com.medicluster.smssender;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import android.util.Base64;
import org.json.JSONObject;

// Journal contains IDs and results only, never mobile numbers or OTP text.
final class SendJournal {
    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("send-journal", Context.MODE_PRIVATE);
    }

    static String binding(Credentials credentials) throws Exception {
        return credentials.origin + ":" + Base64.encodeToString(MessageDigest.getInstance("SHA-256")
                .digest(credentials.token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    static synchronized JSONObject load(Context context) throws Exception {
        String value = preferences(context).getString("job", null);
        return value == null ? null : new JSONObject(value);
    }

    static synchronized void begin(Context context, String id, long expiresAt, Credentials credentials) throws Exception {
        if (load(context) != null) throw new IllegalStateException("Previous SMS result is still pending.");
        JSONObject entry = new JSONObject().put("id", id).put("expiresAt", expiresAt).put("binding", binding(credentials))
                .put("status", "sending").put("startedAt", System.currentTimeMillis());
        write(context, entry);
    }

    static synchronized void finish(Context context, String id, String status, int errorCode) throws Exception {
        JSONObject entry = load(context);
        if (entry == null || !entry.getString("id").equals(id) || !entry.getString("status").equals("sending")) return;
        entry.put("status", status).put("errorCode", errorCode);
        write(context, entry);
    }

    static synchronized void recover(Context context) throws Exception {
        JSONObject entry = load(context);
        if (entry != null && entry.getString("status").equals("sending")) {
            finish(context, entry.getString("id"), SenderPolicy.recover("sending"), -2);
        }
    }

    static synchronized void clear(Context context) {
        if (!preferences(context).edit().remove("job").commit()) throw new IllegalStateException("Could not save SMS result.");
    }

    private static void write(Context context, JSONObject entry) {
        if (!preferences(context).edit().putString("job", entry.toString()).commit()) {
            throw new IllegalStateException("Could not save SMS progress. Sending paused.");
        }
    }
}
