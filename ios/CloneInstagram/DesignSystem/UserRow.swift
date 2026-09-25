import SwiftUI

/// Ligne d'un compte (wireframe) : photo, username, nom et détail facultatif, contenu à droite.
struct UserRow<Trailing: View>: View {
    let user: UserSummary
    var detail: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(avatar: user.avatar, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.username)
                    .font(.subheadline.weight(.semibold))
                Text([user.fullName, detail].compactMap(\.self).joined(separator: " • "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .lineLimit(1)
            Spacer(minLength: 8)
            trailing()
        }
        .accessibilityElement(children: .contain)
    }
}

extension UserRow where Trailing == EmptyView {
    init(user: UserSummary, detail: String? = nil) {
        self.init(user: user, detail: detail) { EmptyView() }
    }
}
