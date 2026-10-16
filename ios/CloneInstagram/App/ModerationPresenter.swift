import SwiftUI

/**
 Signaler et bloquer depuis n'importe quel écran (`ModerationActions`, `Core/Navigation`) : feuille de la
 feature Report et confirmation « Bloquer @x ? ». Appliqué à l'accueil et à la feuille des commentaires : une
 feuille ne peut pas être présentée depuis la racine quand une autre l'est déjà.
 */
struct ModerationPresenter: ViewModifier {
    let dependencies: AppDependencies

    @State private var reportRoute: ReportRoute?
    @State private var blockRoute: BlockRoute?
    @State private var errorMessage: String?

    func body(content: Content) -> some View {
        content
            .environment(\.moderation, ModerationActions(
                report: { reportRoute = $0 },
                block: { blockRoute = $0 }
            ))
            .environment(\.blockedUserIds, dependencies.blocks.blockedIds)
            .sheet(item: $reportRoute) { route in
                ReportView(viewModel: ReportViewModel(
                    route: route,
                    service: dependencies.reports,
                    blocks: dependencies.blocks
                ))
            }
            .alert(
                "Bloquer \(blockRoute?.username ?? "") ?",
                isPresented: isConfirmingBlock,
                presenting: blockRoute
            ) { route in
                Button("Bloquer", role: .destructive) { block(route) }
                Button("Annuler", role: .cancel) {}
            } message: { _ in
                Text(
                    """
                    Ce compte ne pourra plus voir votre profil, vos publications ni vos commentaires, et vous ne \
                    verrez plus les siens. Vos abonnements mutuels seront supprimés. Il ne sera pas informé que \
                    vous l'avez bloqué.
                    """
                )
            }
            .alert(
                "Blocage impossible",
                isPresented: isShowingError
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
    }

    private var isConfirmingBlock: Binding<Bool> {
        Binding(
            get: { blockRoute != nil },
            set: {
                if !$0 {
                    blockRoute = nil
                }
            }
        )
    }

    private var isShowingError: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: {
                if !$0 {
                    errorMessage = nil
                }
            }
        )
    }

    private func block(_ route: BlockRoute) {
        Task {
            if case let .reverted(message)? = await dependencies.blocks.block(userId: route.userId) {
                errorMessage = message
            }
        }
    }
}
