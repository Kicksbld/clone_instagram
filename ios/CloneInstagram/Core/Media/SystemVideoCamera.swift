import CoreTransferable
import SwiftUI
import UniformTypeIdentifiers

/// Copie locale : PhotosPicker ne garantit pas la durée de vie du fichier reçu.
nonisolated struct SelectedVideo: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { received in
            let destination = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).mov")
            try FileManager.default.copyItem(at: received.file, to: destination)
            return SelectedVideo(url: destination)
        }
    }
}

struct SystemVideoCamera: UIViewControllerRepresentable {
    let onFinish: (URL?) -> Void
    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.movie.identifier]
        picker.cameraCaptureMode = .video
        picker.videoMaximumDuration = 60
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIImagePickerController, context _: Context) {}
    func makeCoordinator() -> Coordinator {
        Coordinator(onFinish: onFinish)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (URL?) -> Void
        init(onFinish: @escaping (URL?) -> Void) {
            self.onFinish = onFinish
        }

        func imagePickerControllerDidCancel(_: UIImagePickerController) {
            onFinish(nil)
        }

        func imagePickerController(_: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let source = info[.mediaURL] as? URL else { onFinish(nil); return }
            let destination = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).mov")
            do { try FileManager.default.copyItem(at: source, to: destination); onFinish(destination) }
            catch { onFinish(nil) }
        }
    }
}
