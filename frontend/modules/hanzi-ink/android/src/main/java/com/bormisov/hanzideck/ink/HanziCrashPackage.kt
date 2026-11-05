package com.bormisov.hanzideck.ink

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Process
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.system.exitProcess

class HanziCrashPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(HanziCrashApplicationLifecycleListener())

  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(HanziCrashActivityLifecycleListener())
}

private class HanziCrashApplicationLifecycleListener : ApplicationLifecycleListener {
  override fun onCreate(application: Application) {
    HanziCrashReporter.install(application)
  }
}

private class HanziCrashActivityLifecycleListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    HanziCrashReporter.reportActivityCreated(activity.application)
  }

  override fun onResume(activity: Activity) {
    HanziCrashReporter.reportActivityResumed(activity.application)
  }
}

private object HanziCrashReporter {
  private const val ENDPOINT = "https://zh.x.bormisov.com/api/v1/telemetry/batch"
  private const val PREFERENCES = "hanzi-deck-crash-reporter"
  private const val PENDING_CRASH = "pending-crash"
  private const val INSTALL_ID = "install-id"
  private val installed = AtomicBoolean(false)
  private val activityCreated = AtomicBoolean(false)
  private val activityResumed = AtomicBoolean(false)

  fun install(application: Application) {
    if (!installed.compareAndSet(false, true)) return

    val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val event = event(application, "android_crash", mapOf(
          "source" to "java_uncaught",
          "stage" to "native_uncaught",
          "thread" to thread.name,
          "exception" to error.javaClass.name,
          "message" to (error.message ?: ""),
          "stack" to error.stackTraceToString(),
        ))
        preferences(application).edit().putString(PENDING_CRASH, event.toString()).commit()
      } catch (_: Throwable) {
        // Never replace the app's original fatal exception.
      }

      if (previousHandler != null) previousHandler.uncaughtException(thread, error)
      else {
        Process.killProcess(Process.myPid())
        exitProcess(10)
      }
    }

    reportPendingCrash(application)
    report(application, "android_startup", mapOf("stage" to "application_created"))
  }

  fun reportActivityCreated(application: Application) {
    if (activityCreated.compareAndSet(false, true)) {
      report(application, "android_startup", mapOf("stage" to "activity_created"))
    }
  }

  fun reportActivityResumed(application: Application) {
    if (activityResumed.compareAndSet(false, true)) {
      report(application, "android_startup", mapOf("stage" to "activity_resumed"))
    }
  }

  private fun reportPendingCrash(application: Application) {
    val prefs = preferences(application)
    val pending = prefs.getString(PENDING_CRASH, null) ?: return
    val reporter = Thread({
      if (send(pending)) prefs.edit().remove(PENDING_CRASH).apply()
    }, "hanzi-crash-upload")
    reporter.start()
    try {
      reporter.join(2500)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
  }

  private fun report(application: Application, name: String, properties: Map<String, Any>) {
    try {
      val payload = event(application, name, properties).toString()
      Thread({ send(payload) }, "hanzi-$name").start()
    } catch (_: Throwable) {
      // Diagnostics must never affect normal startup.
    }
  }

  private fun event(application: Application, name: String, properties: Map<String, Any>): JSONObject {
    val packageInfo = application.packageManager.getPackageInfo(application.packageName, 0)
    val diagnosticProperties = JSONObject().apply {
      put("manufacturer", Build.MANUFACTURER)
      put("model", Build.MODEL)
      put("androidSdk", Build.VERSION.SDK_INT)
      put("abis", Build.SUPPORTED_ABIS.joinToString(","))
      for ((key, value) in properties) put(key, value)
    }
    return JSONObject().apply {
      put("eventId", UUID.randomUUID().toString())
      put("name", name)
      put("occurredAt", System.currentTimeMillis())
      put("platform", "android")
      put("appVersion", packageInfo.versionName ?: "unknown")
      put("installId", installId(application))
      put("properties", diagnosticProperties)
    }
  }

  private fun installId(application: Application): String {
    val prefs = preferences(application)
    val existing = prefs.getString(INSTALL_ID, null)
    if (existing != null) return existing
    return UUID.randomUUID().toString().also { prefs.edit().putString(INSTALL_ID, it).commit() }
  }

  private fun preferences(application: Application) =
    application.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun send(event: String): Boolean {
    var connection: HttpURLConnection? = null
    return try {
      connection = URL(ENDPOINT).openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 2000
      connection.readTimeout = 2000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      val body = JSONObject().put("events", JSONArray().put(JSONObject(event))).toString()
      connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
      connection.responseCode in 200..299
    } catch (_: Throwable) {
      false
    } finally {
      connection?.disconnect()
    }
  }
}
