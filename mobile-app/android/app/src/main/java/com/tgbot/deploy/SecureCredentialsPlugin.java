package com.tgbot.deploy;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureCredentials")
public class SecureCredentialsPlugin extends Plugin {

    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "tg_bot_secure_credentials_v1";
    private static final String PREFERENCES_NAME = "tg_bot_secure_credentials";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;

    private SharedPreferences preferences;

    @Override
    public void load() {
        preferences = getContext().getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;

        String encryptedValue = preferences.getString(key, null);
        JSObject result = new JSObject();
        if (encryptedValue == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            result.put("value", decrypt(encryptedValue));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to decrypt secure credentials", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;

        String value = call.getString("value");
        if (value == null) {
            call.reject("Must provide value");
            return;
        }

        try {
            String encryptedValue = encrypt(value);
            if (!preferences.edit().putString(key, encryptedValue).commit()) {
                call.reject("Unable to persist secure credentials");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to encrypt secure credentials", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;

        if (!preferences.edit().remove(key).commit()) {
            call.reject("Unable to remove secure credentials");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (!preferences.edit().clear().commit()) {
            call.reject("Unable to clear secure credentials");
            return;
        }
        call.resolve();
    }

    private String requireKey(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) {
            call.reject("Must provide key");
            return null;
        }
        return key.trim();
    }

    private synchronized SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        java.security.Key existingKey = keyStore.getKey(KEY_ALIAS, null);
        if (existingKey instanceof SecretKey) {
            return (SecretKey) existingKey;
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build();
        keyGenerator.init(spec);
        return keyGenerator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
            + ":"
            + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
    }

    private String decrypt(String encodedValue) throws Exception {
        int separator = encodedValue.indexOf(':');
        if (separator <= 0 || separator >= encodedValue.length() - 1) {
            throw new IllegalArgumentException("Invalid encrypted credential format");
        }

        byte[] iv = Base64.decode(encodedValue.substring(0, separator), Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(encodedValue.substring(separator + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }
}
