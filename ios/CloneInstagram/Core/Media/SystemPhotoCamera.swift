import SwiftUI
import UIKit

/// Caméra système en mode photo (`UIImagePickerController`, sans caméra sur mesure) : renvoie la photo en
/// JPEG, ou `nil` si l'utilisateur annule. Les métadonnées sont retirées ensuite par `ImagePreparer`.
struct SystemPhotoCamera: UIViewControllerRepresentable {
    let onFinish: (Data?) -> Void

    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIImagePickerController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onFinish: onFinish)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (Data?) -> Void

        init(onFinish: @escaping (Data?) -> Void) {
            self.onFinish = onFinish
        }

        func imagePickerControllerDidCancel(_: UIImagePickerController) {
            onFinish(nil)
        }

        func imagePickerController(_: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            onFinish(image?.jpegData(compressionQuality: 0.9))
        }
    }
}
