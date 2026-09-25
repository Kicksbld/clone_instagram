import SwiftUI

/// Bouton Suivre (wireframe) : « Suivre », « Suivre en retour » si le compte me suit, « Suivi(e) ».
struct FollowButton: View {
    let isFollowing: Bool
    let followsMe: Bool
    var isFullWidth = false
    let action: () -> Void

    var body: some View {
        if isFollowing {
            button("Suivi(e)").buttonStyle(.bordered)
        } else {
            button(followsMe ? "Suivre en retour" : "Suivre").buttonStyle(.borderedProminent)
        }
    }

    private func button(_ title: String) -> some View {
        Button(action: action) {
            Text(title)
                .frame(maxWidth: isFullWidth ? .infinity : nil)
        }
    }
}
