import SwiftUI

/// Onglet Recherche provisoire (wireframe) : ouvre un profil par son username exact.
/// Remplacé par la recherche par username ou nom en T5 (`GET /v1/users/search`).
struct UserLookupView: View {
    @State private var username = ""

    private var normalizedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    var body: some View {
        Form {
            Section {
                TextField("Nom d'utilisateur", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textContentType(.username)
            } footer: {
                Text("Saisissez le nom d'utilisateur exact d'un compte.")
            }
            Section {
                NavigationLink("Afficher le profil", value: ProfileRoute(username: normalizedUsername))
                    .disabled(normalizedUsername.isEmpty)
            }
        }
        .navigationTitle("Recherche")
    }
}
