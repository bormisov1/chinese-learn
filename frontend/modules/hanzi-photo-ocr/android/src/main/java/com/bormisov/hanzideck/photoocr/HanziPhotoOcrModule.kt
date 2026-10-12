package com.bormisov.hanzideck.photoocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HanziPhotoOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HanziPhotoOcr")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_CONTEXT", "App context is unavailable", null)
        return@AsyncFunction
      }
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (error: Exception) {
        promise.reject("E_IMAGE", "The photo could not be opened", error)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
      recognizer.process(image)
        .addOnSuccessListener { result ->
          promise.resolve(result.textBlocks.flatMap { block -> block.lines.map { it.text } })
        }
        .addOnFailureListener { error ->
          promise.reject("E_RECOGNITION", error.message, error)
        }
        .addOnCompleteListener { recognizer.close() }
    }
  }
}
