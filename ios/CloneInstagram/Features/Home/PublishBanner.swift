import NukeUI
import SwiftUI

/// Bandeau « Publication en cours » en haut de l'accueil, comme Instagram : miniature, progression ;
/// en cas d'échec, message, « Réessayer » et « Supprimer ».
struct PublishBanner: View {
    let queue: PublishQueue

    var body: some View {
        VStack(spacing: 0) {
            ForEach(queue.items) { item in
                row(item)
                Divider()
            }
        }
    }

    private func row(_ item: PendingPost) -> some View {
        HStack(spacing: 12) {
            LazyImage(url: queue.fileURL(of: item)) { state in
                if let image = state.image {
                    image.resizable().scaledToFill()
                } else {
                    Color.secondary.opacity(0.1)
                }
            }
            .frame(width: 40, height: 40)
            .clipped()
            .accessibilityHidden(true)

            if let message = item.failureMessage {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Échec de la publication")
                        .font(.subheadline.weight(.semibold))
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Réessayer", systemImage: "arrow.clockwise") { queue.retry(item.id) }
                    .labelStyle(.iconOnly)
                Button("Supprimer", systemImage: "trash", role: .destructive) { queue.discard(item.id) }
                    .labelStyle(.iconOnly)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Publication en cours…")
                        .font(.subheadline)
                    ProgressView(value: progress(item.step))
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }

    /// Avancement indicatif selon l'étape.
    private func progress(_ step: PendingPost.Step) -> Double {
        switch step {
        case .upload: 0.25
        case .processing: 0.6
        case .create: 0.9
        }
    }
}
