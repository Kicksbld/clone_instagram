import SwiftUI

/// Mon profil (wireframe) : en-tête depuis `GET /v1/me`, « Modifier le profil », carte « Compléter
/// votre profil », grille des publications. Les écrans « Modifier le profil » et Paramètres sont fournis par
/// le routeur racine.
struct MyProfileView<EditProfile: View, Settings: View>: View {
    let profile: Profile
    let onRefresh: () async -> Void
    /// « Suivre des comptes » : ouvre l'onglet Recherche.
    let onFollowAccounts: () -> Void
    /// Grille de mes publications.
    let posts: ProfilePostsViewModel
    /// Change à chaque post publié : la grille se recharge.
    var postsReloadToken = 0
    @ViewBuilder let editProfile: () -> EditProfile
    /// Menu ☰ : Paramètres et activité.
    @ViewBuilder let settings: () -> Settings

    @State private var isEditing = false
    @State private var isShowingSettings = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header
                ProfilePostsGrid(viewModel: posts, reloadToken: postsReloadToken)
            }
        }
        .refreshable { await onRefresh() }
        .navigationTitle(profile.username)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $isEditing, destination: editProfile)
        .navigationDestination(isPresented: $isShowingSettings, destination: settings)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Paramètres", systemImage: "line.3.horizontal") { isShowingSettings = true }
            }
        }
    }

    private var header: some View {
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
        }
        .padding([.horizontal, .top])
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
