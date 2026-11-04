import NukeUI
import PhotosUI
import SwiftUI

struct MessagesView: View {
    @State private var viewModel: MessagesViewModel
    let viewerId: String
    @Environment(\.blockedUserIds) private var blockedUserIds

    init(viewModel: MessagesViewModel, viewerId: String) {
        _viewModel = State(initialValue: viewModel)
        self.viewerId = viewerId
    }

    var body: some View {
        List {
            if !viewModel.query.isEmpty {
                if let error = viewModel.searchError {
                    Text(error)
                    Button("Réessayer") { Task { await viewModel.search() } }
                }
                ForEach(viewModel.results.filter { !blockedUserIds.contains($0.id) }) { user in
                    NavigationLink(value: ConversationRoute(userId: user.id, username: user.username)) {
                        Label(user.username, systemImage: "person.crop.circle")
                    }
                }
            } else {
                ForEach(viewModel.store.conversations.filter { !blockedUserIds.contains($0.otherMember.id) }) { conversation in
                    NavigationLink {
                        ConversationView(store: viewModel.store, conversation: conversation, viewerId: viewerId)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(conversation.otherMember.username).bold(conversation.unreadCount > 0)
                                if let message = conversation.lastMessage {
                                    Text(message.summary).lineLimit(1).foregroundStyle(.secondary)
                                }
                            }
                            if conversation.unreadCount > 0 {
                                Spacer()
                                // Pastille de non-lus (wireframe : sans couleur).
                                Circle().frame(width: 8, height: 8)
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityValue(conversation.unreadCount > 0 ? "\(conversation.unreadCount) non lus" : "")
                    }
                }
                if viewModel.store.nextConversationCursor != nil {
                    Button("Conversations précédentes") { Task { await viewModel.store.refresh(loadMore: true) } }
                }
                if viewModel.store.conversations.isEmpty {
                    Text("Vos messages apparaîtront ici. Recherchez un compte pour lui écrire.")
                }
            }
        }
        .navigationTitle("Messages")
        .searchable(text: $viewModel.query, prompt: "Nouveau message : rechercher un compte")
        .task(id: viewModel.query) {
            do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
            await viewModel.search()
        }
        .task { await viewModel.store.refresh() }
        .refreshable { await viewModel.store.refresh() }
        .alert(
            "Messages indisponibles",
            isPresented: Binding(get: { viewModel.store.errorMessage != nil }, set: {
                if !$0 {
                    viewModel.store.errorMessage = nil
                }
            })
        ) {
            Button("Réessayer") { Task { await viewModel.store.refresh() } }
            Button("Fermer", role: .cancel) {}
        } message: { Text(viewModel.store.errorMessage ?? "") }
    }
}

struct OpenConversationView: View {
    let route: ConversationRoute
    let store: MessagingStore
    let viewerId: String
    @State private var conversation: Conversation?
    @State private var failed = false

    var body: some View {
        Group {
            if let conversation {
                ConversationView(store: store, conversation: conversation, viewerId: viewerId)
            } else if failed {
                ContentUnavailableView {
                    Label("Conversation indisponible", systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("Réessayer") { Task { await open() } }
                }
            } else {
                ProgressView()
            }
        }
        .task { await open() }
    }

    private func open() async {
        failed = false
        conversation = await store.open(userId: route.userId)
        failed = conversation == nil
    }
}

struct ConversationView: View {
    @Bindable var store: MessagingStore
    let conversation: Conversation
    let viewerId: String
    @State private var draft = ""
    @State private var photoSelection: PhotosPickerItem?
    @State private var isShowingCamera = false
    @State private var photoLoadFailed = false
    @Environment(\.moderation) private var moderation
    @Environment(\.blockedUserIds) private var blockedUserIds
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if store.unavailableConversationIds.contains(conversation.id) {
            ContentUnavailableView("Conversation indisponible", systemImage: "person.crop.circle.badge.questionmark")
        } else {
            conversationContent
        }
    }

    private var conversationContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if store.historyCursors[conversation.id] != nil {
                        Button("Messages précédents") { Task { await store.loadHistory(conversation.id, older: true) } }
                    }
                    let seenId = store.seenMessageId(in: conversation.id)
                    ForEach(store.messages[conversation.id, default: []]) { message in
                        VStack(alignment: .trailing, spacing: 4) {
                            HStack {
                                if message.senderId == viewerId {
                                    Spacer(minLength: 48)
                                }
                                bubble(message)
                                if message.senderId != viewerId {
                                    Spacer(minLength: 48)
                                }
                            }
                            if message.id == seenId {
                                Text("Vu").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .id(message.id)
                    }
                    ForEach(store.pending.filter { $0.conversationId == conversation.id }) { pending in
                        VStack(alignment: .trailing) {
                            if let photo = pending.photo {
                                PendingPhotoView(data: photo)
                            } else {
                                Text(pending.body)
                            }
                            if pending.state == .failed {
                                Button("Non envoyé — Réessayer") { Task { await store.retry(clientId: pending.id) } }
                            } else {
                                Text("Envoi…").foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .padding()
            }
            .onChange(of: store.messages[conversation.id]?.last?.id) { proxy.scrollTo("latest", anchor: .bottom) }
            .onChange(of: store.pending.count) { proxy.scrollTo("latest", anchor: .bottom) }
        }
        .navigationTitle(conversation.otherMember.username)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            HStack {
                if SystemPhotoCamera.isAvailable {
                    Button("Caméra", systemImage: "camera") { isShowingCamera = true }
                        .labelStyle(.iconOnly)
                }
                TextField("Message…", text: $draft, axis: .vertical).lineLimit(1 ... 5)
                PhotosPicker(selection: $photoSelection, matching: .images) {
                    Label("Photothèque", systemImage: "photo")
                }
                .labelStyle(.iconOnly)
                Button("Envoyer", systemImage: "arrow.up") {
                    let body = draft
                    draft = ""
                    Task { await store.send(conversationId: conversation.id, body: body) }
                }
                .disabled(draft.isEmpty || draft.unicodeScalars.count > 1000)
            }
            .padding()
            .glassEffect(in: .rect(cornerRadius: 24))
            .padding(.horizontal)
        }
        .toolbar {
            if let moderation {
                Menu("Plus d'options", systemImage: "ellipsis") {
                    let account = BlockRoute(userId: conversation.otherMember.id, username: conversation.otherMember.username)
                    Button("Signaler", systemImage: "exclamationmark.bubble") { moderation.report(ReportRoute(
                        target: .user(id: account.userId),
                        author: account
                    )) }
                    Button("Bloquer", systemImage: "hand.raised", role: .destructive) { moderation.block(account) }
                }
            }
        }
        .onChange(of: photoSelection) { _, item in
            guard let item else { return }
            photoSelection = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await store.sendPhoto(conversationId: conversation.id, data: data)
                } else {
                    photoLoadFailed = true
                }
            }
        }
        .sheet(isPresented: $isShowingCamera) {
            SystemPhotoCamera { data in
                isShowingCamera = false
                if let data {
                    Task { await store.sendPhoto(conversationId: conversation.id, data: data) }
                }
            }
            .ignoresSafeArea()
        }
        .alert("Photo illisible", isPresented: $photoLoadFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(UploadError.message(for: .unreadableImage))
        }
        .task { await store.enter(conversation.id) }
        .onDisappear { store.leave(conversation.id) }
        .onChange(of: blockedUserIds) {
            if blockedUserIds.contains(conversation.otherMember.id) {
                dismiss()
            }
        }
        .alert("Message", isPresented: Binding(get: { store.errorMessage != nil }, set: {
            if !$0 {
                store.errorMessage = nil
            }
        })) {
            Button("Réessayer") { Task { await store.loadHistory(conversation.id) } }
            Button("Fermer", role: .cancel) {}
        } message: { Text(store.errorMessage ?? "") }
    }
}

private extension ConversationView {
    @ViewBuilder
    func bubble(_ message: ChatMessage) -> some View {
        if message.isStoryReply {
            VStack(alignment: .leading, spacing: 4) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    if let story = message.sharedStory, story.expiresAt > context.date {
                        VStack(alignment: .leading, spacing: 4) {
                            LazyImage(url: story.thumbnail) { state in
                                if let image = state.image {
                                    image.resizable().scaledToFit()
                                } else {
                                    Rectangle().fill(.quaternary)
                                }
                            }
                            .frame(width: 120, height: 180).clipped()
                            Text("Story de \(story.author.username)").font(.caption)
                        }
                    } else {
                        Label("Contenu indisponible", systemImage: "photo.badge.exclamationmark")
                    }
                }
                Text(message.body)
            }
            .padding(8).background(.quaternary, in: .rect(cornerRadius: 12))
        } else if message.isPostShare {
            VStack(alignment: .leading, spacing: 4) {
                if let post = message.sharedPost {
                    NavigationLink(value: PostRoute(postId: post.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            if let thumbnail = post.thumbnail {
                                LazyImage(url: thumbnail) { state in
                                    if let image = state.image {
                                        image.resizable().scaledToFill()
                                    } else {
                                        Rectangle().fill(.quaternary)
                                    }
                                }
                                .frame(width: 180, height: 180).clipped()
                            }
                            Text(post.author.username).bold()
                            Text(post.caption).lineLimit(2)
                        }
                    }
                    .buttonStyle(.plain)
                } else {
                    Label("Contenu indisponible", systemImage: "photo.badge.exclamationmark")
                }
                if !message.body.isEmpty {
                    Text(message.body)
                }
            }
            .padding(8).background(.quaternary, in: .rect(cornerRadius: 12))
        } else if let mediaId = message.mediaId {
            VStack(alignment: message.senderId == viewerId ? .trailing : .leading, spacing: 4) {
                MessagePhotoView(mediaId: mediaId, photos: store.photos)
                if !message.body.isEmpty {
                    Text(message.body).padding(8).background(.quaternary, in: .rect(cornerRadius: 12))
                }
            }
        } else {
            Text(message.body).padding(8).background(.quaternary, in: .rect(cornerRadius: 12))
        }
    }
}
