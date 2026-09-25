import SwiftUI

/// En-tête d'un profil (wireframe) : photo, compteurs, nom et bio ; commun à mon profil et aux autres.
struct ProfileHeaderView: View {
    let avatar: ImageVariants?
    let fullName: String
    let bio: String
    let postCount: Int
    let followerCount: Int
    let followingCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 24) {
                AvatarView(avatar: avatar, size: 86)
                counter(postCount, label: "publications")
                counter(followerCount, label: "followers")
                counter(followingCount, label: "suivi(e)s")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(fullName)
                    .font(.subheadline.weight(.semibold))
                if !bio.isEmpty {
                    Text(bio)
                        .font(.subheadline)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func counter(_ value: Int, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value, format: .number)
                .font(.headline)
            Text(label)
                .font(.footnote)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// Grille des publications ; vide jusqu'aux posts (T6a).
struct ProfileEmptyGridView: View {
    var body: some View {
        ContentUnavailableView("Aucune publication", systemImage: "camera")
    }
}
