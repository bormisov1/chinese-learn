import ExpoModulesCore
import MLKitCommon
import MLKitDigitalInkRecognition

private struct InputPoint: Decodable {
  let x: Double
  let y: Double
  let t: Double
}

public class HanziInkModule: Module {
  private let recognizer: DigitalInkRecognizer? = {
    guard let identifier = DigitalInkRecognitionModelIdentifier(forLanguageTag: "zh-Hani-CN") else {
      return nil
    }
    let model = DigitalInkRecognitionModel(modelIdentifier: identifier)
    return DigitalInkRecognizer.digitalInkRecognizer(options: DigitalInkRecognizerOptions(model: model))
  }()

  private func chineseModel() -> DigitalInkRecognitionModel? {
    guard let identifier = DigitalInkRecognitionModelIdentifier(forLanguageTag: "zh-Hani-CN") else {
      return nil
    }
    return DigitalInkRecognitionModel(modelIdentifier: identifier)
  }

  public func definition() -> ModuleDefinition {
    Name("HanziInk")

    AsyncFunction("isModelDownloaded") { (promise: Promise) in
      guard let model = self.chineseModel() else {
        promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.")
        return
      }
      promise.resolve(ModelManager.modelManager().isModelDownloaded(model))
    }

    AsyncFunction("downloadModel") { (promise: Promise) in
      guard let model = self.chineseModel() else {
        promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.")
        return
      }

      let manager = ModelManager.modelManager()
      if manager.isModelDownloaded(model) {
        promise.resolve(true)
        return
      }

      var successObserver: NSObjectProtocol?
      var failureObserver: NSObjectProtocol?
      var finished = false
      func finish(_ error: String?) {
        guard !finished else { return }
        finished = true
        if let observer = successObserver { NotificationCenter.default.removeObserver(observer) }
        if let observer = failureObserver { NotificationCenter.default.removeObserver(observer) }
        if let error = error {
          promise.reject("E_DOWNLOAD", error)
        } else {
          promise.resolve(true)
        }
      }

      successObserver = NotificationCenter.default.addObserver(
        forName: .mlkitModelDownloadDidSucceed, object: nil, queue: .main
      ) { _ in
        if manager.isModelDownloaded(model) { finish(nil) }
      }
      failureObserver = NotificationCenter.default.addObserver(
        forName: .mlkitModelDownloadDidFail, object: nil, queue: .main
      ) { _ in
        if !manager.isModelDownloaded(model) {
          finish("Could not download the Chinese model. Check your connection and retry.")
        }
      }

      let conditions = ModelDownloadConditions(
        allowsCellularAccess: true, allowsBackgroundDownloading: false
      )
      manager.download(model, conditions: conditions)
    }

    AsyncFunction("recognize") { (strokesJSON: String, width: Double, height: Double, promise: Promise) in
      guard let model = self.chineseModel() else {
        promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.")
        return
      }
      guard ModelManager.modelManager().isModelDownloaded(model) else {
        promise.reject("E_MODEL_NOT_READY", "The Chinese model is still downloading.")
        return
      }

      do {
        let input = try JSONDecoder().decode([[InputPoint]].self, from: Data(strokesJSON.utf8))
        let strokes = input.filter { !$0.isEmpty }.map { points in
          Stroke(points: points.map { point in
            StrokePoint(x: Float(point.x), y: Float(point.y), t: Int(point.t))
          })
        }
        if strokes.isEmpty {
          promise.resolve([String]())
          return
        }

        let ink = Ink(strokes: strokes)
        guard let recognizer = self.recognizer else {
          promise.reject("E_MODEL", "The Chinese handwriting model is unavailable.")
          return
        }
        let area = WritingArea(width: Float(max(width, 1)), height: Float(max(height, 1)))
        let context = DigitalInkRecognitionContext(preContext: "", writingArea: area)
        recognizer.recognize(ink: ink, context: context) { [recognizer, ink, context] result, error in
          withExtendedLifetime((recognizer, ink, context)) {
            if let error = error {
              promise.reject("E_RECOGNITION", error.localizedDescription)
            } else {
              promise.resolve(result?.candidates.prefix(12).map { $0.text } ?? [])
            }
          }
        }
      } catch {
        promise.reject("E_STROKES", error.localizedDescription)
      }
    }
  }
}
