import NukeUI
import SwiftUI

/// Activité (wireframe, comme Instagram) : demandes d'abonnement en tête, avec Accepter / Refuser, puis
/// notifications regroupées par période ; un appui ouvre le post ou le profil. Ouvrir l'écran marque tout
/// comme lu.
struct ActivityView: View {
    @State private var viewModel: ActivityViewModel

    init(viewModel: ActivityViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        content
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.appear() }
            .alert(
                "Action impossible",
                isPresented: Binding(
                    get: { viewModel.requestErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.requestErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.requestErrorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(message):
            ContentUnavailableView {
                Label("Activité indisponible", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Réessayer") { Task { await viewModel.load() } }
            }
        case .loaded where viewModel.isEmpty:
            ContentUnavailableView {
                Label("Aucune activité", systemImage: "heart")
            } description: {
                Text("Quand quelqu'un aime ou commente vos publications, ou demande à vous suivre, vous le verrez ici.")
            }
            .refreshable { await viewModel.load() }
        case .loaded:
            list
        }
    }

    private var list: some View {
        List {
            if viewModel.showsFollowRequests {
                followRequestsSection
            }
            ForEach(viewModel.sections) { section in
                Section(section.period.title) {
                    ForEach(section.groups) { group in
                        link(to: ActivityViewModel.destination(for: group)) { row(group) }
                            .task { await viewModel.groupAppeared(group) }
                    }
                }
            }
            if viewModel.isLoadingMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }
            if viewModel.loadMoreFailed {
                Button("Charger la suite") { Task { await viewModel.loadMore() } }
                    .frame(maxWidth: .infinity)
            }
        }
        .listStyle(.plain)
        .refreshable { await viewModel.load() }
    }

    /// Demandes d'abonnement reçues, en tête de l'Activité comme Instagram.
    private var followRequestsSection: some View {
        Section(viewModel.followRequestsTitle) {
            if viewModel.requestsLoadFailed {
                Button("Impossible de charger les demandes. Réessayer") {
                    Task { await viewModel.loadRequests() }
                }
            }
            ForEach(viewModel.followRequests) { requester in
                followRequestRow(requester)
            }
            if viewModel.isLoadingMoreRequests {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else if viewModel.hasMoreRequests {
                Button("Voir plus") { Task { await viewModel.loadMoreRequests() } }
                    .frame(maxWidth: .infinity)
            }
        }
    }

    /// Une demande : le profil du demandeur (appui), Accepter et Refuser (style `bordered` : les boutons gardent
    /// leur geste dans la ligne qui ouvre le profil).
    private func followRequestRow(_ requester: UserSummary) -> some View {
        NavigationLink(value: ProfileRoute(username: requester.username)) {
            UserRow(user: requester) {
                Button("Accepter") { Task { await viewModel.respond(.accept, to: requester) } }
                    .buttonStyle(.borderedProminent)
                Button("Refuser") { Task { await viewModel.respond(.decline, to: requester) } }
                    .buttonStyle(.bordered)
            }
            .controlSize(.small)
        }
    }

    /// Destinations fournies par le routeur racine (`PostRoute`, `ProfileRoute`) : une feature n'en importe
    /// pas une autre (ADR-010).
    @ViewBuilder
    private func link(to destination: ActivityViewModel.Destination, @ViewBuilder label: () -> some View) -> some View {
        switch destination {
        case let .post(route):
            NavigationLink(value: route, label: label)
        case let .profile(route):
            NavigationLink(value: route, label: label)
        }
    }

    /// Ancienneté de la notification, comme Instagram (« 2 h »).
    private func age(of group: ActivityGroup) -> Text {
        Text(group.createdAt, format: .relative(presentation: .numeric, unitsStyle: .narrow))
            .foregroundStyle(.secondary)
    }

    private func row(_ group: ActivityGroup) -> some View {
        HStack(spacing: 12) {
            AvatarView(avatar: group.actor.avatar, size: 44)
            Text("\(ActivityViewModel.message(for: group)) \(age(of: group))")
                .font(.subheadline)
                .lineLimit(3)
            Spacer(minLength: 8)
            if let post = group.post {
                LazyImage(url: post.thumbnail.thumb) { state in
                    if let image = state.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.secondary.opacity(0.1)
                    }
                }
                .frame(width: 44, height: 44)
                .clipped()
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
