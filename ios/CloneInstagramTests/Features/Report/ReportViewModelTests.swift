import Testing
@testable import CloneInstagram

struct ReportViewModelTests {
    private let service = FakeReportService()
    private let social = FakeSocialService()
    private static let author = BlockRoute(userId: "lea", username: "lea")

    private func makeViewModel(
        _ target: ReportRoute.Target = .post(id: "p1"),
        blocks: BlockStore? = nil
    ) -> ReportViewModel {
        ReportViewModel(
            route: ReportRoute(target: target, author: Self.author),
            service: service,
            blocks: blocks ?? BlockStore(service: social)
        )
    }

    @Test func `motif touché → envoyé tout de suite, écran « Merci »`() async {
        let viewModel = makeViewModel()

        await viewModel.select(.spam)

        #expect(service.requests == [.init(target: .post(id: "p1"), reason: .spam, details: nil)])
        #expect(viewModel.step == .sent)
    }

    @Test func `autre chose → précisions nettoyées, puis envoi`() async {
        let viewModel = makeViewModel(.comment(id: "c1"))

        await viewModel.select(.other)
        #expect(viewModel.isEnteringDetails)
        #expect(service.requests.isEmpty)
        #expect(!viewModel.canSendDetails)

        viewModel.details = "  Arnaque  "
        await viewModel.sendDetails()

        #expect(service.requests == [.init(target: .comment(id: "c1"), reason: .other, details: "Arnaque")])
        #expect(viewModel.step == .sent)
    }

    @Test func `précisions trop longues → envoi impossible`() {
        let viewModel = makeViewModel()
        viewModel.details = String(repeating: "x", count: ReportViewModel.maxDetailsLength + 1)

        #expect(!viewModel.canSendDetails)
    }

    @Test func `contenu supprimé ou invisible → targetGone`() async {
        service.errors = [.targetNotFound]
        let viewModel = makeViewModel()

        await viewModel.select(.hate)

        #expect(viewModel.step == .targetGone)
    }

    @Test(arguments: [ReportServiceError.rateLimited(retryAfter: 60), .unreachable])
    func `échec → message, on peut réessayer`(error: ReportServiceError) async {
        service.errors = [error]
        let viewModel = makeViewModel()

        await viewModel.select(.spam)
        #expect(viewModel.step == .choosing)
        #expect(viewModel.errorMessage != nil)

        await viewModel.select(.spam)
        #expect(viewModel.step == .sent)
    }

    @Test func `bloquer l'auteur depuis « Merci » → compte bloqué`() async {
        let store = BlockStore(service: social)
        let viewModel = makeViewModel(.user(id: "lea"), blocks: store)
        await viewModel.select(.harassment)

        await viewModel.blockAuthor()

        #expect(social.blocks == ["lea"])
        #expect(viewModel.blockState == .blocked)
        #expect(store.isBlocked("lea"))
    }

    @Test func `blocage refusé → bouton de nouveau disponible, message`() async {
        social.blockErrors = [.unreachable]
        let viewModel = makeViewModel()

        await viewModel.blockAuthor()

        #expect(viewModel.blockState == .idle)
        #expect(viewModel.errorMessage != nil)
    }

    @Test func `titre selon la cible`() {
        #expect(makeViewModel(.post(id: "p")).question == "Pourquoi signalez-vous cette publication ?")
        #expect(makeViewModel(.comment(id: "c")).question == "Pourquoi signalez-vous ce commentaire ?")
        #expect(makeViewModel(.user(id: "u")).question == "Pourquoi signalez-vous ce compte ?")
    }
}
