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
      // ML Kit's frames must use the same upright coordinates as the image view.
      // UIImage.size can describe the unrotated JPEG while its EXIF orientation
      // makes the displayed image portrait, leaving boxes sideways and offset.
      let sourceSize = image.cgImage.map { CGSize(width: $0.width, height: $0.height) } ?? image.size
      let sideways = image.imageOrientation == .left || image.imageOrientation == .right ||
        image.imageOrientation == .leftMirrored || image.imageOrientation == .rightMirrored
      let uprightSize = sideways
        ? CGSize(width: sourceSize.height, height: sourceSize.width)
        : sourceSize
      let upright: UIImage
      if image.imageOrientation == .up {
        upright = image
      } else {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        upright = UIGraphicsImageRenderer(size: uprightSize, format: format).image { _ in
          image.draw(in: CGRect(origin: .zero, size: uprightSize))
        }
      }
      let visionImage = VisionImage(image: upright)
      visionImage.orientation = .up
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
        promise.resolve(["width": uprightSize.width, "height": uprightSize.height, "words": words])
      }
    }
  }
}
