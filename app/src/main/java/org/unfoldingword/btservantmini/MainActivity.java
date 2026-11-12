package org.unfoldingword.btservantmini;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BT Servant Mini. A WebView shows the chat page (assets/www) and reads the language packs shipped in the app; the model runs in
 * llama-server, a process started from the app's native library folder and reached only on 127.0.0.1. Nothing goes online.
 */
public class MainActivity extends Activity {
    private static final String TAG = "BTServantMini";
    private static final String MODEL_ASSET = "model/ms-all-q8.gguf";
    private static final int PORT = 8080;

    private WebView web;
    private static Process server;
    private static volatile boolean ready = false;
    private static volatile String status = "";
    private final ExecutorService pool = Executors.newFixedThreadPool(2);

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
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
        web.setWebChromeClient(new android.webkit.WebChromeClient()); // JS dialogs (alert, confirm) and, later, file pickers
        web.addJavascriptInterface(new Bridge(), "Android");
        final android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(web);
        setContentView(root);
        // Android 15+ draws under the status and navigation bars: keep the page inside them, and above the keyboard.
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets b = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return android.view.WindowInsets.CONSUMED;
            });
        }
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
        if (server == null) pool.execute(this::startServer);
    }

    /** Copies the model out of the APK once, then starts llama-server and waits until it answers /health. */
    private void startServer() {
        try {
            File model = new File(getFilesDir(), "ms-all-q8.gguf");
            long size = getAssets().openFd(MODEL_ASSET).getLength();
            if (!model.exists() || model.length() != size) {
                File tmp = new File(getFilesDir(), "model.part");
                try (InputStream in = getAssets().open(MODEL_ASSET); OutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[1 << 20];
                    long done = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        status = "(" + (100 * done / size) + "%)";
                    }
                }
                if (!tmp.renameTo(model)) throw new IllegalStateException("cannot place the model file");
            }
            status = "";
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
                    status = "(server stopped: " + server.exitValue() + ")";
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
        } catch (Exception e) {
            Log.e(TAG, "server", e);
            status = "(" + e.getMessage() + ")";
        }
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
        try (InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } finally {
            c.disconnect();
        }
    }

    private class Bridge {
        @JavascriptInterface
        public boolean ready() { return ready; }

        @JavascriptInterface
        public String status() { return status; }

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

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isFinishing() && server != null) {
            server.destroy();
            server = null;
            ready = false;
        }
    }
}
