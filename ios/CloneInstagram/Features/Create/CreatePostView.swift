import PhotosUI
import SwiftUI

/**
 Nouvelle publication (wireframe, parcours d'Instagram) : photo et recadrage, puis légende et « Partager ».
 « Sélectionner plusieurs » passe au carrousel (10 photos au plus, dans l'ordre de sélection).
 */
struct CreatePostView: View {
    @State private var viewModel: CreatePostViewModel
    @State private var videoSelection: PhotosPickerItem?
    @State private var isShowingCamera = false
    @State private var selection: PhotosPickerItem?
    @State private var multipleSelection: [PhotosPickerItem] = []
    @State private var isSelectingMultiple = false
    @State private var isShowingCaption = false
    let onClose: () -> Void

    init(viewModel: CreatePostViewModel, onClose: @escaping () -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onClose = onClose
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Type de publication", selection: Binding(get: { viewModel.isReel }, set: { viewModel.isReel = $0 })) {
                    Text("Post").tag(false)
                    Text("Reel").tag(true)
                }.pickerStyle(.segmented).padding()
                if viewModel.isReel {
                    ReelSourcePicker(viewModel: viewModel, videoSelection: $videoSelection) { isShowingCamera = true }
                } else {
                    cropArea
                    if viewModel.photos.count > 1 {
                        SelectedPhotosStrip(viewModel: viewModel)
                    }
                    pickerHeader
                    picker
                        .photosPickerStyle(.inline)
                        .photosPickerDisabledCapabilities(.selectionActions)
                        .photosPickerAccessoryVisibility(.hidden, edges: .all)
                }
            }
            .navigationTitle("Nouvelle publication")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer", systemImage: "xmark", action: onClose)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Suivant") { isShowingCaption = true }
                        .disabled(!viewModel.canContinue)
                }
            }
            .navigationDestination(isPresented: $isShowingCaption) {
                CaptionView(viewModel: viewModel, onShared: onClose)
            }
            .sheet(isPresented: $isShowingCamera) {
                SystemVideoCamera { url in
                    isShowingCamera = false
                    if let url {
                        viewModel.selectVideo(url)
                    }
                }
            }
            .onChange(of: videoSelection) { _, item in
                guard let item else { return }
                Task {
                    await viewModel.loadVideo { try await item.loadTransferable(type: SelectedVideo.self)?.url }
                }
            }
            .task { await preselectLatestPhoto() }
            .onChange(of: selection) { _, item in
                guard let item else { return }
                Task { await load([item]) }
            }
            .onChange(of: multipleSelection) { _, items in
                Task { await load(items) }
            }
            .alert(
                "Photos illisibles",
                isPresented: Binding(
                    get: { viewModel.loadErrorMessage != nil },
                    set: {
                        if !$0 {
                            viewModel.loadErrorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.loadErrorMessage ?? "")
            }
        }
    }

    /**
     Sélecteur intégré sans bouton « Ajouter » : la sélection doit être transmise à chaque toucher
     (`continuousAndOrdered`), sinon elle n'arrive jamais. `photoLibrary: .shared()` donne à chaque photo un
     identifiant stable (sans demander l'accès à la galerie) : la photo déjà choisie reste présélectionnée
     en passant à « Sélectionner plusieurs », et son cadrage est gardé.
     */
    @ViewBuilder
    private var picker: some View {
        if isSelectingMultiple {
            PhotosPicker(
                selection: $multipleSelection,
                maxSelectionCount: CreatePostViewModel.maxPhotos,
                selectionBehavior: .continuousAndOrdered,
                matching: .images,
                preferredItemEncoding: .current,
                photoLibrary: .shared()
            ) {
                Text("Choisir des photos")
            }
        } else {
            PhotosPicker(
                selection: $selection,
                matching: .images,
                preferredItemEncoding: .current,
                photoLibrary: .shared()
            ) {
                Text("Choisir une photo")
            }
        }
    }

    private var pickerHeader: some View {
        HStack {
            Text("Récents")
                .font(.headline)
            Spacer()
            Toggle(isOn: Binding(get: { isSelectingMultiple }, set: setSelectingMultiple)) {
                Label("Sélectionner plusieurs", systemImage: "square.on.square")
            }
            .toggleStyle(.button)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    /// Bascule simple ↔ plusieurs : la photo affichée reste la première du carrousel, comme sur Instagram.
    private func setSelectingMultiple(_ isOn: Bool) {
        isSelectingMultiple = isOn
        if isOn {
            multipleSelection = selection.map { [$0] } ?? []
        } else {
            selection = multipleSelection.first
            multipleSelection = []
            Task { await load(selection.map { [$0] } ?? []) }
        }
    }

    /// À l'ouverture, comme Instagram : la photo la plus récente est sélectionnée et affichée.
    private func preselectLatestPhoto() async {
        guard selection == nil, multipleSelection.isEmpty, viewModel.photos.isEmpty,
              let identifier = await viewModel.latestPhotoIdentifier(),
              selection == nil, multipleSelection.isEmpty
        else { return }
        selection = PhotosPickerItem(itemIdentifier: identifier)
    }

    /// Photos identifiées par leur identifiant dans la galerie : stable d'une sélection à l'autre.
    private func load(_ items: [PhotosPickerItem]) async {
        let keyed = items.map { item in (key: item.itemIdentifier.map(AnyHashable.init) ?? AnyHashable(item), item: item) }
        let byKey = Dictionary(keyed.map { ($0.key, $0.item) }, uniquingKeysWith: { first, _ in first })
        await viewModel.updateSelection(keyed.map(\.key)) { key in
            guard let item = byKey[key] else { return nil }
            return try? await item.loadTransferable(type: Data.self)
        }
    }

    @ViewBuilder
    private var cropArea: some View {
        switch viewModel.photo {
        case .empty:
            placeholder { Text("Choisissez une photo dans votre galerie.") }
        case .loading:
            placeholder { ProgressView().accessibilityLabel("Chargement en cours") }
        case let .failed(message):
            placeholder { Text(message) }
        case let .loaded(image):
            CropView(viewModel: viewModel, image: image)
        }
    }

    private func placeholder(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding()
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
    }
}
