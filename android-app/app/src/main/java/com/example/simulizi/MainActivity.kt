package com.example.simulizi

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("crash_prefs", 0)
        val previousCrash = prefs.getString("crash_log", null)
        if (previousCrash != null) {
            val tv = android.widget.TextView(this)
            tv.text = "APP CRASHED PREVIOUSLY:\n\n$previousCrash"
            tv.setTextColor(android.graphics.Color.RED)
            tv.setPadding(32, 64, 32, 32)
            val scrollView = android.widget.ScrollView(this)
            scrollView.addView(tv)
            setContentView(scrollView)
            
            // Clear the log so it attempts to run normally next time
            prefs.edit().clear().commit()
            return
        }

        Thread.setDefaultUncaughtExceptionHandler { _, e ->
            val log = "FATAL UNCAUGHT: ${e.message}\n${android.util.Log.getStackTraceString(e)}"
            getSharedPreferences("crash_prefs", 0).edit().putString("crash_log", log).commit()
            System.exit(1)
        }

        try {
            // Request permissions for camera and audio
            val permissions = arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_EXTERNAL_STORAGE
            )
            
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, permissions, 1)
            }

            val webView = WebView(this).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = true
                settings.allowContentAccess = true
                settings.mediaPlaybackRequiresUserGesture = false
                
                webViewClient = WebViewClient()
                webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: PermissionRequest) {
                        request.grant(request.resources)
                    }
                }
            }
            
            setContentView(webView)
            webView.loadUrl("file:///android_asset/index.html")

        } catch (e: Exception) {
            val log = "CRASH IN ONCREATE: ${e.message}\n${android.util.Log.getStackTraceString(e)}"
            val tv = android.widget.TextView(this)
            tv.text = log
            tv.setTextColor(android.graphics.Color.RED)
            tv.setPadding(32, 64, 32, 32)
            val scrollView = android.widget.ScrollView(this)
            scrollView.addView(tv)
            setContentView(scrollView)
        }
    }
}
