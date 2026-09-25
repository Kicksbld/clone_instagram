import Testing
@testable import CloneInstagram

struct UsernameSuggestionTests {
    @Test(arguments: [
        ("Killian Boularand", "killianboularand"),
        ("Éloïse Çavé", "eloisecave"),
        ("Jean-Marc O'Neil", "jeanmarconeil"),
        ("anne.marie_2", "anne.marie_2"),
    ])
    func `candidat tiré du nom`(fullName: String, expected: String) {
        #expect(UsernameSuggestion.candidate(fullName: fullName, email: "x@example.com") == expected)
    }

    @Test func `nom inutilisable → partie locale de l'email`() {
        #expect(UsernameSuggestion.candidate(fullName: "李雷", email: "k.b+test@example.com") == "k.btest")
    }

    @Test func `rien d'utilisable → user`() {
        #expect(UsernameSuggestion.candidate(fullName: "李雷", email: "") == "user")
    }

    @Test func `trente caractères au plus`() {
        #expect(UsernameSuggestion.candidate(fullName: String(repeating: "a", count: 40), email: "") == String(repeating: "a", count: 30))
    }

    @Test(arguments: [("killian", true), ("k.b_2", true), ("Killian", false), ("kil lian", false), ("", false)])
    func `format du username`(value: String, valid: Bool) {
        #expect(UsernameSuggestion.isValid(value) == valid)
        #expect(UsernameSuggestion.isValid(String(repeating: "a", count: 31)) == false)
    }
}
