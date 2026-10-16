import Testing
@testable import CloneInstagram

struct OptimisticSyncTests {
    private enum Failure: Error, Equatable {
        case unreachable
    }

    /// Faux serveur : réponses programmables, appels enregistrés.
    private final class Server {
        /// Réponses successives ; quand la liste est vide : l'état demandé.
        var results: [Result<Bool, Failure>] = []
        /// Appelé pendant un appel, avant la réponse (ex. l'utilisateur touche encore le bouton).
        var duringCall: (() async -> Void)?
        private(set) var calls: [String] = []

        func reply(_ key: String, _ intent: Bool) async throws(Failure) -> Bool {
            calls.append("\(key):\(intent)")
            if let duringCall {
                self.duringCall = nil
                await duringCall()
            }
            guard !results.isEmpty else { return intent }
            return try results.removeFirst().get()
        }
    }

    private let engine = OptimisticSync<String, Bool>()
    private let server = Server()

    private typealias Outcome = OptimisticOutcome<Bool, Bool, Failure>

    private func sync(
        _ intent: Bool,
        key: String = "a",
        confirmed: Bool = false
    ) async -> Outcome {
        await engine.sync(key, to: intent, confirmed: confirmed, intentOf: { $0 }) { wanted throws(Failure) -> Bool in
            try await server.reply(key, wanted)
        }
    }

    @Test func `un changement : envoyé, puis confirmé par l'API`() async {
        let outcome = await sync(true)

        #expect(server.calls == ["a:true"])
        #expect(outcome == .confirmed(true))
    }

    @Test func `appel en cours signalé, puis terminé`() async {
        var duringCall: Bool?
        server.duringCall = { duringCall = engine.isSyncing("a") }

        _ = await sync(true)

        #expect(duringCall == true)
        #expect(!engine.isSyncing("a"))
    }

    @Test func `état déjà confirmé : aucun appel`() async {
        let outcome = await sync(true, confirmed: true)

        #expect(server.calls.isEmpty)
        #expect(outcome == .confirmed(true))
    }

    @Test func `un changement pendant l'appel : un seul appel de rattrapage, le dernier choix gagne`() async {
        var nested: Outcome?
        server.duringCall = { nested = await sync(false) }

        let outcome = await sync(true)

        #expect(nested == .pending)
        #expect(server.calls == ["a:true", "a:false"])
        #expect(outcome == .confirmed(false))
    }

    @Test func `deux changements pendant l'appel qui reviennent à l'état envoyé : aucun appel de plus`() async {
        var nested: [Outcome] = []
        server.duringCall = {
            await nested.append(sync(false))
            await nested.append(sync(true))
        }

        let outcome = await sync(true)

        #expect(nested == [.pending, .pending])
        #expect(server.calls == ["a:true"])
        #expect(outcome == .confirmed(true))
    }

    @Test func `échec : retour au dernier état confirmé`() async {
        server.results = [.failure(.unreachable)]

        let outcome = await sync(true)

        #expect(outcome == .failed(.unreachable, intent: true, confirmed: false))
        #expect(!engine.isSyncing("a"))
    }

    @Test func `échec du rattrapage : retour à l'état confirmé par le premier appel`() async {
        server.results = [.success(true), .failure(.unreachable)]
        server.duringCall = { _ = await sync(false) }

        let outcome = await sync(true)

        #expect(server.calls == ["a:true", "a:false"])
        #expect(outcome == .failed(.unreachable, intent: false, confirmed: true))
    }

    @Test func `clés indépendantes : une autre clé est envoyée pendant l'appel`() async {
        var other: Outcome?
        server.duringCall = { other = await sync(true, key: "b") }

        _ = await sync(true)

        #expect(other == .confirmed(true))
        #expect(server.calls == ["a:true", "b:true"])
    }

    @Test func `déconnexion pendant l'appel : aucun rattrapage envoyé`() async {
        server.duringCall = {
            _ = await sync(false)
            engine.reset()
        }

        _ = await sync(true)

        #expect(server.calls == ["a:true"])
    }
}
