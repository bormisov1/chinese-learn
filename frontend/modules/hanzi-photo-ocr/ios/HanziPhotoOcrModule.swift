import ExpoModulesCore
import MLKitTextRecognitionCommon
import MLKitTextRecognitionChinese
import MLKitVision
import UIKit

public class HanziPhotoOcrModule: Module {
  private let recognizer = TextRecognizer.textRecognizer(options: ChineseTextRecognizerOptions())

  public func definition() -> ModuleDefinition {
    Name("HanziPhotoOcr")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL,
            let image = UIImage(contentsOfFile: url.path) else {
        promise.reject("E_IMAGE", "The photo could not be opened.")
        return
      }
      let visionImage = VisionImage(image: image)
      visionImage.orientation = image.imageOrientation
      self.recognizer.process(visionImage) { result, error in
        if let error = error {
          promise.reject("E_RECOGNITION", error.localizedDescription)
          return
        }
        let lines = result?.blocks.flatMap { block in block.lines.map { $0.text } } ?? []
        promise.resolve(lines)
      }
    }
  }
}
