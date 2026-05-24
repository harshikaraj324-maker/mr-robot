package com.godz.myapplication

  import android.annotation.SuppressLint
  import android.app.AlertDialog
  import android.os.Bundle
  import android.util.TypedValue
  import android.view.LayoutInflater
  import android.view.MotionEvent
  import android.view.View
  import android.webkit.WebSettings
  import android.webkit.WebView
  import android.webkit.WebViewClient
  import android.widget.Button
  import android.widget.EditText
  import android.widget.LinearLayout
  import androidx.activity.ComponentActivity
  import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

  class MainActivity : ComponentActivity() {

      private lateinit var webView: WebView
      private lateinit var swipeRefreshLayout: SwipeRefreshLayout

      private val prefs by lazy {
          getSharedPreferences("app_prefs", MODE_PRIVATE)
      }

      @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
      override fun onCreate(savedInstanceState: Bundle?) {
          super.onCreate(savedInstanceState)

          val rootLayout = LinearLayout(this).apply {
              orientation = LinearLayout.VERTICAL
          }

          val topView = View(this).apply {
              layoutParams = LinearLayout.LayoutParams(
                  LinearLayout.LayoutParams.MATCH_PARENT,
                  dpToPx(30)
              )
          }

          swipeRefreshLayout = SwipeRefreshLayout(this)

          webView = WebView(this).apply {
              layoutParams = LinearLayout.LayoutParams(
                  LinearLayout.LayoutParams.MATCH_PARENT,
                  LinearLayout.LayoutParams.MATCH_PARENT
              )
              overScrollMode = WebView.OVER_SCROLL_NEVER
          }

          webView.setOnTouchListener { _, event ->
              if (event.action == MotionEvent.ACTION_DOWN) {
                  val topLimit = webView.height * 0.25f
                  swipeRefreshLayout.isEnabled =
                      event.y <= topLimit && !webView.canScrollVertically(-1)
              }
              false
          }

          webView.webViewClient = object : WebViewClient() {
              override fun onPageFinished(view: WebView?, url: String?) {
                  swipeRefreshLayout.isRefreshing = false
              }
          }

          webView.settings.apply {
              javaScriptEnabled = true
              domStorageEnabled = true
              databaseEnabled = true
              cacheMode = WebSettings.LOAD_DEFAULT
              mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
              builtInZoomControls = false
              displayZoomControls = false
          }

          swipeRefreshLayout.setOnRefreshListener {
              webView.reload()
          }

          swipeRefreshLayout.addView(webView)
          rootLayout.addView(topView)
          rootLayout.addView(
              swipeRefreshLayout,
              LinearLayout.LayoutParams(
                  LinearLayout.LayoutParams.MATCH_PARENT,
                  0,
                  1f
              )
          )

          setContentView(rootLayout)

          val savedAppId = prefs.getString("APP_ID", null)

          if (savedAppId.isNullOrEmpty()) {
              showAppIdDialog()
          } else {
              loadDashboard(savedAppId)
          }
      }

      private fun showAppIdDialog() {
          val dialogView = LayoutInflater.from(this)
              .inflate(R.layout.dialog_app_verification, null)

          val editAppId  = dialogView.findViewById<EditText>(R.id.editAppId)
          val btnProceed = dialogView.findViewById<Button>(R.id.btnProceed)

          val dialog = AlertDialog.Builder(this)
              .setView(dialogView)
              .setCancelable(false)
              .create()

          dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

          btnProceed.setOnClickListener {
              val appId = editAppId.text.toString().trim()
              if (appId.isNotEmpty()) {
                  prefs.edit().putString("APP_ID", appId).apply()
                  dialog.dismiss()
                  loadDashboard(appId)
              } else {
                  editAppId.error = "Enter APP ID"
              }
          }

          dialog.show()
      }

      private fun loadDashboard(appId: String) {
          // Proxy ke through backend dashboard — real URL kabhi expose nahi hoga
          val url = "https://proxy-6tq.pages.dev/api/dashboard/WebDashboard?appId=$appId"
          webView.loadUrl(url)
      }

      private fun dpToPx(dp: Int): Int {
          return TypedValue.applyDimension(
              TypedValue.COMPLEX_UNIT_DIP,
              dp.toFloat(),
              resources.displayMetrics
          ).toInt()
      }

      @Suppress("DEPRECATION")
      override fun onBackPressed() {
          // disabled
      }
  }
  