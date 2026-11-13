package org.unfoldingword.btservantmini;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BT Servant Mini. A WebView shows the chat page (assets/www) and reads the language packs (shipped in the app, or added
 * later into the page's IndexedDB); the model runs in llama-server, a process started from the app's native library folder
 * and reached only on 127.0.0.1.
 *
 * The model is the one in the APK (full build), or one the person downloads (from the packs server) or loads from a file
 * (SD card, phone memory, another phone): the light build ships none. Nothing goes online unless the person asks.
 */
public class MainActivity extends Activity {
    private static final String TAG = "BTServantMini";
    private static final String MODEL_ASSET = "model/ms-all-q8.gguf";
    private static final String MODEL_FILE = "model.gguf";
    private static final int PORT = 8080;
    private static final int PICK_PAGE_FILE = 1;
    private static final int PICK_MODEL = 2;

    private WebView web;
    private static Process server;
    private static volatile boolean ready = false;
    /** missing | copying | starting | ready | downloading | importing | error — plus a detail. */
    private static volatile String state = "starting";
    private static volatile String detail = "";
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private ValueCallback<Uri[]> pageFileCallback;
    private String modelSha;
    private OutputStream saving;
    private Uri savingUri;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        WebView.setWebContentsDebuggingEnabled(true);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }
        });
        // JS dialogs, and <input type=file> (a .tcpack from the SD card, the phone memory or a chat app)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pageFileCallback != null) pageFileCallback.onReceiveValue(null);
                pageFileCallback = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                startActivityForResult(i, PICK_PAGE_FILE);
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        final android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(web);
        setContentView(root);
        // Android 15+ draws under the status and navigation bars: keep the page inside them, and above the keyboard.
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets b = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return android.view.WindowInsets.CONSUMED;
            });
        }
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
        if (server == null) pool.execute(this::prepareModel);
    }

    private File modelFile() { return new File(getFilesDir(), MODEL_FILE); }

    private boolean hasModelAsset() {
        try { getAssets().openFd(MODEL_ASSET).close(); return true; } catch (Exception e) { return false; }
    }

    /** The model in the APK is copied out once; without one, the app waits for a download or a file. */
    private void prepareModel() {
        try {
            File model = modelFile();
            // the full build of 0.6 and earlier kept it under this name
            File old = new File(getFilesDir(), "ms-all-q8.gguf");
            if (!model.exists() && old.exists() && old.renameTo(model)) Log.i(TAG, "model file renamed");
            if (hasModelAsset()) {
                long size = getAssets().openFd(MODEL_ASSET).getLength();
                if (!model.exists() || model.length() != size) {
                    state = "copying";
                    try (InputStream in = getAssets().open(MODEL_ASSET)) { copyInto(in, size, model, null); }
                }
            }
            if (!model.exists()) {
                state = "missing";
                detail = "";
                return;
            }
            startServer(model);
        } catch (Exception e) {
            Log.e(TAG, "model", e);
            state = "error";
            detail = String.valueOf(e.getMessage());
        }
    }

    /** Copies a stream into `target` through a .part file; checks the sha256 when one is given. */
    private void copyInto(InputStream in, long size, File target, String sha) throws Exception {
        File tmp = new File(getFilesDir(), target.getName() + ".part");
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 20];
            long done = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                md.update(buf, 0, n);
                done += n;
                if (size > 0) detail = String.valueOf(100 * done / size);
            }
        }
        if (sha != null && !sha.isEmpty() && !hex(md.digest()).equalsIgnoreCase(sha)) {
            tmp.delete();
            throw new IllegalStateException("the file is not the expected model (sha256 differs)");
        }
        if (target.exists() && !target.delete()) throw new IllegalStateException("cannot replace the model file");
        if (!tmp.renameTo(target)) throw new IllegalStateException("cannot place the model file");
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /** Starts llama-server on the model and waits until it answers /health. */
    private void startServer(File model) throws Exception {
        state = "starting";
        detail = "";
        String libDir = getApplicationInfo().nativeLibraryDir;
        List<String> cmd = new ArrayList<>();
        cmd.add(libDir + "/libllamaserver.so");
        cmd.add("-m"); cmd.add(model.getAbsolutePath());
        cmd.add("--host"); cmd.add("127.0.0.1");
        cmd.add("--port"); cmd.add(String.valueOf(PORT));
        cmd.add("-c"); cmd.add("2048");
        cmd.add("-np"); cmd.add("1");
        cmd.add("-t"); cmd.add("4");
        ProcessBuilder pb = new ProcessBuilder(cmd).directory(new File(libDir));
        pb.environment().put("LD_LIBRARY_PATH", libDir);
        pb.redirectErrorStream(true);
        pb.redirectOutput(new File(getFilesDir(), "llama-server.log"));
        server = pb.start();
        for (int i = 0; i < 600 && !ready; i++) {
            if (!server.isAlive()) {
                state = "error";
                detail = "server stopped: " + server.exitValue();
                server = null;
                return;
            }
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("http://127.0.0.1:" + PORT + "/health").openConnection();
                c.setConnectTimeout(500);
                c.setReadTimeout(1000);
                if (c.getResponseCode() == 200) ready = true;
                c.disconnect();
            } catch (Exception ignored) {
            }
            if (!ready) Thread.sleep(500);
        }
        state = ready ? "ready" : "error";
    }

    private void stopServer() {
        if (server != null) {
            server.destroy();
            server = null;
        }
        ready = false;
    }

    /** Downloads the model (resuming a cut download), checks its sha256, and starts it. */
    private void downloadModel(String url, String sha, long size) {
        try {
            state = "downloading";
            detail = "0";
            File part = new File(getFilesDir(), MODEL_FILE + ".download");
            long have = part.exists() ? part.length() : 0;
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
            int code = c.getResponseCode();
            if (code != 200 && code != 206) throw new IllegalStateException("download failed: HTTP " + code);
            boolean append = code == 206;
            if (!append) have = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part, append)) {
                byte[] buf = new byte[1 << 20];
                int n;
                long done = have;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    if (size > 0) detail = String.valueOf(100 * done / size);
                }
            } finally {
                c.disconnect();
            }
            state = "importing";
            detail = "";
            stopServer();
            try (InputStream in = new FileInputStream(part)) { copyInto(in, size, modelFile(), sha); }
            part.delete();
            startServer(modelFile());
        } catch (Exception e) {
            Log.e(TAG, "download", e);
            state = "error";
            detail = String.valueOf(e.getMessage()) + " (the download resumes where it stopped)";
        }
    }

    /** A model chosen by the person (SD card, phone memory, received from another phone). */
    private void importModel(Uri uri) {
        try {
            state = "importing";
            detail = "0";
            stopServer();
            long size = -1;
            try (android.database.Cursor cur = getContentResolver().query(uri, new String[] {android.provider.OpenableColumns.SIZE}, null, null, null)) {
                if (cur != null && cur.moveToFirst()) size = cur.getLong(0);
            }
            try (InputStream in = getContentResolver().openInputStream(uri)) { copyInto(in, size, modelFile(), modelSha); }
            startServer(modelFile());
        } catch (Exception e) {
            Log.e(TAG, "import", e);
            state = modelFile().exists() ? "error" : "missing";
            detail = String.valueOf(e.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (request == PICK_PAGE_FILE && pageFileCallback != null) {
            pageFileCallback.onReceiveValue(uri != null ? new Uri[] {uri} : null);
            pageFileCallback = null;
        } else if (request == PICK_MODEL && uri != null) {
            pool.execute(() -> importModel(uri));
        }
    }

    /** A new file in the public Downloads folder (where file managers and chat apps can find it to share it). */
    private OutputStream openDownload(String name, String mime) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            savingUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            return getContentResolver().openOutputStream(savingUri);
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        savingUri = Uri.fromFile(new File(dir, name));
        return new FileOutputStream(new File(dir, name));
    }

    private String post(String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("http://127.0.0.1:" + PORT + "/completion").openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(2000);
        c.setReadTimeout(120000);
        c.setRequestProperty("Content-Type", "application/json");
        try (OutputStream o = c.getOutputStream()) {
            o.write(body.getBytes(StandardCharsets.UTF_8));
        }
        // readAllBytes() needs Android 13: read by hand, the app runs from Android 8
        try (InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream()) {
            java.io.ByteArrayOutputStream all = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) all.write(buf, 0, n);
            return new String(all.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            c.disconnect();
        }
    }

    private class Bridge {
        @JavascriptInterface
        public boolean ready() { return ready; }

        /** The model's state for the page: "ready", "missing", "downloading:42", "error:…" */
        @JavascriptInterface
        public String status() { return detail.isEmpty() ? state : state + ":" + detail; }

        @JavascriptInterface
        public String flavor() { return hasModelAsset() ? "full" : "lite"; }

        @JavascriptInterface
        public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
        }

        @JavascriptInterface
        public void downloadModel(String url, String sha, String size) {
            if (state.equals("downloading") || state.equals("importing")) return;
            pool.execute(() -> MainActivity.this.downloadModel(url, sha, Long.parseLong(size)));
        }

        @JavascriptInterface
        public void pickModel(String sha) {
            modelSha = sha;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            runOnUiThread(() -> startActivityForResult(i, PICK_MODEL));
        }

        /** Copies the installed model to Downloads, to pass it to another phone. Returns "" or an error. */
        @JavascriptInterface
        public String exportModel(String name) {
            try (InputStream in = new FileInputStream(modelFile()); OutputStream out = openDownload(name, "application/octet-stream")) {
                byte[] buf = new byte[1 << 20];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return "";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }

        /** A file from the page (a .tcpack), sent in base64 chunks, written to Downloads. */
        @JavascriptInterface
        public String saveBegin(String name, String mime) {
            try {
                saving = openDownload(name, mime);
                return "";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }

        @JavascriptInterface
        public String saveChunk(String b64) {
            try {
                saving.write(Base64.decode(b64, Base64.DEFAULT));
                return "";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }

        @JavascriptInterface
        public String saveEnd() {
            try {
                saving.close();
                saving = null;
                return "";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }

        @JavascriptInterface
        public void complete(final String id, final String body) {
            pool.execute(() -> {
                String result;
                try {
                    result = post(body);
                } catch (Exception e) {
                    result = "ERROR:" + e.getMessage();
                }
                final String js = "window.__llm(" + JSONObject.quote(id) + "," + JSONObject.quote(result) + ")";
                runOnUiThread(() -> web.evaluateJavascript(js, null));
            });
        }
    }

    /** Back closes what the page has open (the bottom panel, the menu) before it leaves the app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.__back && window.__back()) ? 1 : 0", (r) -> {
            if (!"1".equals(r)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isFinishing()) stopServer();
    }
}
