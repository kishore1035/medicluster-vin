package com.medicluster.smssender;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class Credentials {
    final String origin;
    final String token;
    private static final String ALIAS = "medicluster-sms-gateway";

    Credentials(String origin, String token) {
        this.origin = SenderPolicy.origin(origin, BuildConfig.DEBUG);
        this.token = token.trim();
        if (this.token.length() < 32) throw new IllegalArgumentException("Sender key must contain at least 32 characters.");
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    void save(Context context) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        String encoded = Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        boolean saved = context.getSharedPreferences("credentials", Context.MODE_PRIVATE).edit()
                .putString("origin", origin).putString("token", encoded)
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit();
        if (!saved) throw new IllegalStateException("Could not save sender settings.");
    }

    static Credentials load(Context context) throws Exception {
        SharedPreferences preferences = context.getSharedPreferences("credentials", Context.MODE_PRIVATE);
        if (!preferences.contains("token")) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP)));
        String token = new String(cipher.doFinal(Base64.decode(preferences.getString("token", ""), Base64.NO_WRAP)), StandardCharsets.UTF_8);
        return new Credentials(preferences.getString("origin", ""), token);
    }
}
