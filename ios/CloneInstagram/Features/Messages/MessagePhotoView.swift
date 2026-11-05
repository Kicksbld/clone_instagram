import Nuke
import NukeUI
import SwiftUI

/// Photo of a message (wireframe), read through a signed URL; an expired URL is renewed once by itself,
/// then « Réessayer » asks a new one (ADR-023).
struct MessagePhotoView: View {
    let mediaId: String
    let photos: MessagePhotoURLs
    @State private var request: ImageRequest?
    @State private var unavailable = false
    @State private var attempt = 0
    @State private var renewedAutomatically = false

    var body: some View {
        Group {
            if let request {
                LazyImage(request: request) { state in
                    if let image = state.image {
                        image.resizable().scaledToFit()
                    } else if state.error != nil {
                        retry
                    } else {
                        placeholder
                    }
                }
                .pipeline(MessagePhotoURLs.pipeline)
                .onCompletion { result in
                    guard case .failure = result else { return }
                    photos.expire(mediaId: mediaId, variant: .medium)
                    if !renewedAutomatically {
                        renewedAutomatically = true
                        attempt += 1
                    }
                }
            } else if unavailable {
                retry
            } else {
                placeholder
            }
        }
        .frame(width: 220, height: 220)
        .clipShape(.rect(cornerRadius: 12))
        .accessibilityLabel("Photo sans description")
        .task(id: attempt) {
            let loaded = await photos.request(mediaId: mediaId, variant: .medium)
            guard !Task.isCancelled else { return }
            request = loaded
            unavailable = loaded == nil
        }
    }

    private var placeholder: some View {
        Rectangle().fill(.quaternary).overlay { ProgressView().accessibilityLabel("Chargement en cours") }
    }

    private var retry: some View {
        Rectangle().fill(.quaternary).overlay {
            Button("Photo indisponible — Réessayer", systemImage: "arrow.clockwise") {
                photos.expire(mediaId: mediaId, variant: .medium)
                request = nil
                unavailable = false
                attempt += 1
            }
            .font(.footnote)
            .padding()
        }
    }
}

/// My photo while it is uploading or after a failure: shown from the chosen file, never from the network.
struct PendingPhotoView: View {
    let data: Data

    var body: some View {
        Group {
            if let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .frame(width: 220, height: 220)
        .clipShape(.rect(cornerRadius: 12))
        .accessibilityLabel("Photo sans description")
    }
}
