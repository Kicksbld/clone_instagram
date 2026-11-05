import SwiftUI

/// Modification de la légende d'un de mes posts, ouverte depuis le menu « … » de `PostView` et affichée par
/// la feature EditPost ; présentée par `App` : une feature n'importe pas une autre (ADR-010).
struct EditPostRoute: Hashable, Identifiable {
    let postId: String
    /// Légende affichée à l'ouverture.
    let caption: String
    var mediaAltTexts: [String] = []

    var id: String {
        postId
    }
}

/// Ouvre la modification ; absente (`nil`) quand aucun écran parent ne sait la présenter.
struct OpenEditPostAction {
    let open: (EditPostRoute) -> Void

    func callAsFunction(_ route: EditPostRoute) {
        open(route)
    }
}

extension EnvironmentValues {
    @Entry var openEditPost: OpenEditPostAction?
}
