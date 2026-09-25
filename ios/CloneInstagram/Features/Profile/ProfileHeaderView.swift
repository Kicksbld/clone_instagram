import SwiftUI

/// En-tête d'un profil (wireframe) : photo, compteurs, nom et bio ; commun à mon profil et aux autres.
/// Les compteurs followers / suivi(e)s ouvrent les listes quand `listRoute` est fourni.
struct ProfileHeaderView: View {
    let avatar: ImageVariants?
    let fullName: String
    let bio: String
    let postCount: Int
    let followerCount: Int
    let followingCount: Int
    /// `nil` : listes non consultables (compte privé que je ne suis pas).
    var listRoute: ((FollowListKind) -> FollowListRoute)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 24) {
                AvatarView(avatar: avatar, size: 86)
                counter(postCount, label: "publications")
                listLink(.followers, counter(followerCount, label: "followers"))
                listLink(.following, counter(followingCount, label: "suivi(e)s"))
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

    @ViewBuilder
    private func listLink(_ kind: FollowListKind, _ label: some View) -> some View {
        if let listRoute {
            NavigationLink(value: listRoute(kind)) { label }
                .buttonStyle(.plain)
        } else {
            label
        }
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
