import NukeUI
import SwiftUI

/// Photo de profil ronde (wireframe) : variante adaptée à la taille affichée (ADR-010), repli sans photo.
struct AvatarView: View {
    let avatar: ImageVariants?
    let size: CGFloat
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Group {
            if let avatar {
                LazyImage(url: avatar.url(forPixelWidth: size * displayScale)) { state in
                    if let image = state.image {
                        image.resizable().scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        Image(systemName: "person.crop.circle.fill")
            .resizable()
            .scaledToFit()
            .foregroundStyle(.secondary)
    }
}
