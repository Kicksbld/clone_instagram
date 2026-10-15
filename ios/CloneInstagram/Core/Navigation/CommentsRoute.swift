import SwiftUI

/// Feuille des commentaires d'un post, ouverte depuis `PostView` (feed, détail) et affichée par la feature
/// Comments ; présentée par `App` : une feature n'importe pas une autre (ADR-010).
struct CommentsRoute: Hashable, Identifiable {
    let postId: String
    /// Nombre de commentaires affiché à l'ouverture.
    let commentCount: Int

    var id: String {
        postId
    }
}

/// Ouvre la feuille des commentaires ; absente (`nil`) quand aucun écran parent ne sait la présenter.
struct OpenCommentsAction {
    let open: (CommentsRoute) -> Void

    func callAsFunction(_ route: CommentsRoute) {
        open(route)
    }
}

extension EnvironmentValues {
    @Entry var openComments: OpenCommentsAction?
}
