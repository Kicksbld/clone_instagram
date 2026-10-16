import Testing
@testable import CloneInstagram

struct BlockStoreTests {
    private let service = FakeSocialService()
    private let store: BlockStore

    init() {
        store = BlockStore(service: service)
    }

    @Test func `blocage : compte retiré pendant l'appel, puis feed rechargé`() async {
        var duringCall: (isBlocked: Bool, revision: Int)?
        service.duringBlock = { duringCall = (store.isBlocked("lea"), store.revision) }

        let outcome = await store.block(userId: "lea")

        #expect(duringCall?.isBlocked == true)
        #expect(duringCall?.revision == 0)
        #expect(outcome == .confirmed)
        #expect(service.blocks == ["lea"])
        #expect(store.isBlocked("lea"))
        #expect(store.revision == 1)
    }

    @Test func `blocage refusé : compte réaffiché, feed rechargé, message`() async {
        service.blockErrors = [.userNotFound]

        let outcome = await store.block(userId: "lea")

        #expect(outcome == .reverted(message: "Ce compte n'est plus disponible."))
        #expect(!store.isBlocked("lea"))
        #expect(store.revision == 1)
    }

    @Test func `débloquer pendant le blocage : un seul appel de rattrapage`() async {
        var nested: [BlockOutcome?] = []
        service.duringBlock = { await nested.append(store.unblock(userId: "lea")) }

        let outcome = await store.block(userId: "lea")

        #expect(nested == [nil])
        #expect(service.blocks == ["lea"])
        #expect(service.unblocks == ["lea"])
        #expect(outcome == .confirmed)
        #expect(!store.isBlocked("lea"))
        #expect(store.revision == 1)
    }

    @Test func `déblocage : le compte n'est plus retiré, le feed n'est pas rechargé`() async {
        await store.block(userId: "lea")

        let outcome = await store.unblock(userId: "lea")

        #expect(outcome == .confirmed)
        #expect(service.unblocks == ["lea"])
        #expect(!store.isBlocked("lea"))
        #expect(store.revision == 1)
    }

    @Test func `déjà bloqué : rien n'est envoyé`() async {
        store.record(blocked: [.fixture(id: "lea")])

        #expect(await store.block(userId: "lea") == nil)
        #expect(service.blocks.isEmpty)
    }

    @Test func `comptes bloqués reçus pendant un déblocage en cours : le déblocage est gardé`() async {
        store.record(blocked: [.fixture(id: "lea")])
        service.duringBlock = { store.record(blocked: [.fixture(id: "lea")]) }

        await store.unblock(userId: "lea")

        #expect(!store.isBlocked("lea"))
    }

    @Test func `déconnexion → rien n'est gardé`() async {
        await store.block(userId: "lea")

        store.reset()

        #expect(store.blockedIds.isEmpty)
        #expect(store.revision == 0)
    }
}
