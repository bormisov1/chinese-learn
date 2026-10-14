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
        let words = result?.blocks.flatMap { block in
          block.lines.flatMap { line in
            line.elements.map { element -> [String: Any] in
              let frame = element.frame
              return [
                "text": element.text,
                "box": ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
              ]
            }
          }
        } ?? []
        promise.resolve(["width": image.size.width, "height": image.size.height, "words": words])
      }
    }
  }
}
