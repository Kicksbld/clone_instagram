import SwiftUI

/**
 Suppression d'un post refusée par l'API (`PostDeletionStore`) : le post est réaffiché et l'alerte s'affiche,
 même si l'écran qui l'a demandée est fermé. Appliqué à l'accueil et à la feuille des commentaires : une alerte
 ne s'affiche pas sous une feuille ouverte.
 */
struct PostDeletionAlert: ViewModifier {
    let deletions: PostDeletionStore

    func body(content: Content) -> some View {
        content
            .alert(
                "Suppression impossible",
                isPresented: Binding(
                    get: { deletions.errorMessage != nil },
                    set: {
                        if !$0 {
                            deletions.errorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deletions.errorMessage ?? "")
            }
    }
}
