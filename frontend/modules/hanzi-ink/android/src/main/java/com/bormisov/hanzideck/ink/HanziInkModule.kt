package com.bormisov.hanzideck.ink

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions
import com.google.mlkit.vision.digitalink.recognition.Ink
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext
import com.google.mlkit.vision.digitalink.recognition.WritingArea
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class HanziInkModule : Module() {
  private val model by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
    DigitalInkRecognitionModelIdentifier.fromLanguageTag("zh-Hani-CN")
      ?.let { DigitalInkRecognitionModel.builder(it).build() }
  }
  private val recognizer by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
    model?.let { DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(it).build()) }
  }

  override fun definition() = ModuleDefinition {
    Name("HanziInk")

    AsyncFunction("isModelDownloaded") { promise: Promise ->
      val currentModel = model
      if (currentModel == null) {
        promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.", null)
        return@AsyncFunction
      }
      RemoteModelManager.getInstance().isModelDownloaded(currentModel)
        .addOnSuccessListener { promise.resolve(it) }
        .addOnFailureListener { promise.reject("E_MODEL", it.message, it) }
    }

    AsyncFunction("downloadModel") { promise: Promise ->
      val currentModel = model
      if (currentModel == null) {
        promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.", null)
        return@AsyncFunction
      }
      RemoteModelManager.getInstance()
        .download(currentModel, DownloadConditions.Builder().build())
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { promise.reject("E_DOWNLOAD", it.message, it) }
    }

    AsyncFunction("recognize") { strokesJSON: String, width: Double, height: Double, promise: Promise ->
      val currentRecognizer = recognizer
      if (currentRecognizer == null) {
        promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.", null)
        return@AsyncFunction
      }
      try {
        val input = JSONArray(strokesJSON)
        val inkBuilder = Ink.builder()
        for (strokeIndex in 0 until input.length()) {
          val points = input.getJSONArray(strokeIndex)
          if (points.length() == 0) continue
          val strokeBuilder = Ink.Stroke.builder()
          for (pointIndex in 0 until points.length()) {
            val point = points.getJSONObject(pointIndex)
            strokeBuilder.addPoint(Ink.Point.create(
              point.getDouble("x").toFloat(),
              point.getDouble("y").toFloat(),
              point.getDouble("t").toLong()
            ))
          }
          inkBuilder.addStroke(strokeBuilder.build())
        }
        val ink = inkBuilder.build()
        val context = RecognitionContext.builder()
          .setPreContext("")
          .setWritingArea(WritingArea(width.coerceAtLeast(1.0).toFloat(), height.coerceAtLeast(1.0).toFloat()))
          .build()
        currentRecognizer.recognize(ink, context)
          .addOnSuccessListener { result -> promise.resolve(result.candidates.take(12).map { it.text }) }
          .addOnFailureListener { promise.reject("E_RECOGNITION", it.message, it) }
      } catch (error: Exception) {
        promise.reject("E_STROKES", error.message, error)
      }
    }
  }
}
