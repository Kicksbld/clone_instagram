import Testing
@testable import CloneInstagram

struct BlockStoreTests {
    private let service = FakeSocialService()

    @Test func `blocage confirmé → compte retiré des écrans, feed rechargé`() async throws {
        let store = BlockStore(service: service)

        try await store.block(userId: "lea")

        #expect(service.blocks == ["lea"])
        #expect(store.isBlocked("lea"))
        #expect(store.revision == 1)
    }

    @Test func `blocage refusé → rien ne change`() async {
        service.blockErrors = [.userNotFound]
        let store = BlockStore(service: service)

        await #expect(throws: SocialServiceError.userNotFound) { try await store.block(userId: "lea") }

        #expect(!store.isBlocked("lea"))
        #expect(store.revision == 0)
    }

    @Test func `déblocage → le compte n'est plus retiré, le feed n'est pas rechargé`() async throws {
        let store = BlockStore(service: service)
        try await store.block(userId: "lea")

        try await store.unblock(userId: "lea")

        #expect(service.unblocks == ["lea"])
        #expect(!store.isBlocked("lea"))
        #expect(store.revision == 1)
    }

    @Test func `déconnexion → rien n'est gardé`() async throws {
        let store = BlockStore(service: service)
        try await store.block(userId: "lea")

        store.reset()

        #expect(store.blockedIds.isEmpty)
        #expect(store.revision == 0)
    }
}
