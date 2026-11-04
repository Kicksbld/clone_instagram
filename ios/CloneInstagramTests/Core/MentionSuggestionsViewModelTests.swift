import Testing
@testable import CloneInstagram

struct MentionSuggestionsViewModelTests {
    @Test func `recherche la mention en cours et insère le compte choisi`() async {
        let social = FakeSocialService()
        let user = UserSummary.fixture(username: "hugo")
        social.searchResults = [.success([user])]
        let model = MentionSuggestionsViewModel()
        await model.search("Avec @hu", using: social)
        #expect(social.searches == ["hu"])
        #expect(model.users == [user])
        #expect(model.selecting(user, in: "Avec @hu") == "Avec @hugo ")
    }

    @Test func `email texte terminé et arobase seule ne lancent pas de recherche`() async {
        let social = FakeSocialService()
        let model = MentionSuggestionsViewModel()
        for text in ["mail@exemple", "Avec @", "Avec @hugo ", "bonjour"] {
            await model.search(text, using: social)
        }
        #expect(social.searches.isEmpty)
        #expect(model.users.isEmpty)
    }

    @Test func `échec puis nouvel essai conserve la possibilité de mentionner`() async {
        let social = FakeSocialService()
        social.searchResults = [.failure(.unreachable), .success([.fixture()])]
        let model = MentionSuggestionsViewModel()
        await model.search("@hu", using: social)
        #expect(model.errorMessage != nil)
        await model.search("@hu", using: social)
        #expect(model.errorMessage == nil)
        #expect(model.users.count == 1)
    }

    @Test func `réponse dépassée ignorée`() async {
        let social = FakeSocialService()
        let model = MentionSuggestionsViewModel()
        social.searchResults = [.success([.fixture()])]
        social.onSearch = { model.clear() }
        await model.search("@hu", using: social)
        #expect(model.users.isEmpty)
    }
}
