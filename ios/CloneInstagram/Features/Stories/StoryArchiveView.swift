import NukeUI
import SwiftUI

struct StoryArchiveView: View {
    @State private var viewModel: StoryArchiveViewModel
    let viewerId: String
    let service: any StoryService
    let isPlus: () -> Bool
    @State private var selectedStory: Story?
    @State private var deletions: StoryDeletionStore

    init(viewerId: String, service: any StoryService, isPlus: @escaping () -> Bool) {
        self.viewerId = viewerId
        self.service = service
        self.isPlus = isPlus
        _viewModel = State(initialValue: StoryArchiveViewModel(service: service))
        _deletions = State(initialValue: StoryDeletionStore(service: service))
    }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 3), spacing: 2) {
                ForEach(deletions.visible(viewModel.items)) { story in
                    Button { selectedStory = story } label: {
                        LazyImage(url: story.photo.variants.medium) { state in
                            if let image = state.image {
                                image.resizable().scaledToFill()
                            } else {
                                Rectangle().fill(.quaternary).overlay { ProgressView().accessibilityLabel("Chargement en cours") }
                            }
                        }
                        .aspectRatio(9 / 16, contentMode: .fit)
                        .clipped()
                        .overlay(alignment: .bottomLeading) {
                            Text(story.createdAt, style: .date).font(.caption).padding(4)
                        }
                    }
                    .accessibilityLabel(
                        "Story du \(story.createdAt.formatted(date: .abbreviated, time: .omitted)). \(story.photo.accessibilityDescription)"
                    )
                }
            }
            if viewModel.isLoading {
                ProgressView().accessibilityLabel("Chargement en cours").padding()
            }
            if let error = viewModel.errorMessage {
                Text(error).padding()
                Button("Réessayer") {
                    Task {
                        if viewModel.hasMore {
                            await viewModel.loadMore()
                        } else {
                            await viewModel.load()
                        }
                    }
                }
            } else if viewModel.hasMore {
                Button("Voir plus") { Task { await viewModel.loadMore() } }.padding()
            } else if !viewModel.isLoading, deletions.visible(viewModel.items).isEmpty {
                ContentUnavailableView(
                    "Aucune story archivée",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Vos stories apparaîtront ici après leur expiration.")
                )
            }
        }
        .accessibilityStatus(viewModel.errorMessage ?? "")
        .navigationTitle("Archive")
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .fullScreenCover(item: $selectedStory, onDismiss: { Task { await viewModel.load() } }) { story in
            StoryViewerView(viewModel: StoryViewerViewModel(
                viewerId: viewerId, authors: [story.author], startIndex: 0, service: service, deletions: deletions,
                isPlus: isPlus, archivedStories: deletions.visible(viewModel.items), initialStoryId: story.id
            ))
        }
        .alert("Action impossible", isPresented: Binding(
            get: { selectedStory == nil && deletions.errorMessage != nil },
            set: {
                if !$0 {
                    deletions.errorMessage = nil
                }
            }
        )) {
            Button("OK", role: .cancel) { deletions.errorMessage = nil }
        } message: { Text(deletions.errorMessage ?? "") }
    }
}
