import SwiftUI

extension EnvironmentValues {
    @Entry var mentionSearchService: any SocialService = UnavailableSocialService()
}

struct MentionSuggestions: View {
    @Binding var text: String
    @Environment(\.mentionSearchService) private var social
    @Environment(\.blockedUserIds) private var blockedUserIds
    @State private var viewModel = MentionSuggestionsViewModel()

    var body: some View {
        VStack(alignment: .leading) {
            ForEach(viewModel.users.filter { !blockedUserIds.contains($0.id) }) { user in
                Button {
                    text = viewModel.selecting(user, in: text)
                } label: {
                    HStack {
                        AvatarView(avatar: user.avatar, size: 28)
                        Text("@\(user.username)")
                    }
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Mentionner \(user.username)")
            }
            if let error = viewModel.errorMessage {
                Button(error) { Task { await viewModel.search(text, using: social) } }
            }
        }
        .task(id: text) {
            viewModel.clear()
            do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
            await viewModel.search(text, using: social)
        }
    }
}
