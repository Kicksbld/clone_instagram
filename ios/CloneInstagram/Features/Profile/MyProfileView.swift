import SwiftUI

/// Mon profil (wireframe) : en-tête depuis `GET /v1/me`, « Modifier le profil », carte « Compléter
/// votre profil », grille vide. L'écran « Modifier le profil » est fourni par le routeur racine.
struct MyProfileView<EditProfile: View>: View {
    let profile: Profile
    let onRefresh: () async -> Void
    let onSignOut: () -> Void
    /// « Suivre des comptes » : ouvre l'onglet Recherche.
    let onFollowAccounts: () -> Void
    @ViewBuilder let editProfile: () -> EditProfile

    @State private var isEditing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ProfileHeaderView(
                    avatar: profile.avatar,
                    fullName: profile.fullName,
                    bio: profile.bio,
                    postCount: profile.postCount,
                    followerCount: profile.followerCount,
                    followingCount: profile.followingCount,
                    listRoute: { kind in
                        FollowListRoute(
                            userId: profile.id,
                            username: profile.username,
                            followerCount: profile.followerCount,
                            followingCount: profile.followingCount,
                            kind: kind
                        )
                    }
                )
                Button("Modifier le profil") { isEditing = true }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                let completion = ProfileCompletion(profile: profile)
                if !completion.isComplete {
                    completionCard(completion)
                }
                ProfileEmptyGridView()
            }
            .padding()
        }
        .refreshable { await onRefresh() }
        .navigationTitle(profile.username)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $isEditing, destination: editProfile)
        .toolbar {
            // Provisoire jusqu'aux paramètres (T12).
            ToolbarItem(placement: .topBarTrailing) {
                Button("Se déconnecter", action: onSignOut)
            }
        }
    }

    private func completionCard(_ completion: ProfileCompletion) -> some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(ProfileCompletion.Step.allCases, id: \.self) { step in
                    completionRow(step, isCompleted: completion.isCompleted(step))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("Compléter votre profil")
                Text("\(completion.completedCount) sur \(completion.totalCount) terminées")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func completionRow(_ step: ProfileCompletion.Step, isCompleted: Bool) -> some View {
        let label = Label {
            Text(step.title)
        } icon: {
            Image(systemName: isCompleted ? "checkmark.circle.fill" : step.systemImage)
        }
        switch step {
        case .photo, .bio:
            Button { isEditing = true } label: { label }
                .disabled(isCompleted)
        case .followAccounts:
            Button(action: onFollowAccounts) { label }
                .disabled(isCompleted)
        }
    }
}
