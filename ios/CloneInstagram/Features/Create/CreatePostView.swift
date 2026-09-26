import PhotosUI
import SwiftUI

/**
 Nouvelle publication (wireframe, parcours d'Instagram) : photo et recadrage, puis légende et « Partager ».
 « Sélectionner plusieurs » passe au carrousel (10 photos au plus, dans l'ordre de sélection).
 */
struct CreatePostView: View {
    @State private var viewModel: CreatePostViewModel
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
            placeholder { ProgressView() }
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

/// Cadre de recadrage : la zone affichée est exactement celle qui sera publiée (pincer pour zoomer,
/// glisser pour déplacer) ; le bouton en bas à gauche bascule entre carré et ratio d'origine.
private struct CropView: View {
    let viewModel: CreatePostViewModel
    let image: CGImage
    @State private var gestureZoom: Double?
    @State private var gestureTranslation: CGSize?
    /// Largeur du cadre à l'écran (points), pour convertir un glissement en pixels de la photo.
    @State private var frameWidth: CGFloat = 1

    var body: some View {
        GeometryReader { proxy in
            let frame = Self.frameSize(in: proxy.size, aspectRatio: viewModel.aspectRatio)
            let rect = displayedRect
            let scale = frame.width / max(rect.width, 1)
            Image(decorative: image, scale: 1)
                .resizable()
                .frame(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
                .offset(x: -rect.minX * scale, y: -rect.minY * scale)
                .frame(width: frame.width, height: frame.height, alignment: .topLeading)
                .clipped()
                .contentShape(Rectangle())
                .gesture(dragGesture.simultaneously(with: magnifyGesture))
                .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
        .onGeometryChange(for: CGFloat.self) { [aspectRatio = viewModel.aspectRatio] proxy in
            Self.frameSize(in: proxy.size, aspectRatio: aspectRatio).width
        } action: { width in
            frameWidth = width
        }
        .overlay(alignment: .bottomLeading) {
            Button(
                viewModel.isSquare ? "Ratio d'origine" : "Carré",
                systemImage: viewModel.isSquare
                    ? "arrow.up.left.and.arrow.down.right"
                    : "arrow.down.right.and.arrow.up.left",
                action: viewModel.toggleSquare
            )
            .labelStyle(.iconOnly)
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .padding(12)
        }
    }

    /// Cadre au ratio choisi, contenu dans la zone carrée.
    private nonisolated static func frameSize(in bounds: CGSize, aspectRatio: Double) -> CGSize {
        aspectRatio >= 1
            ? CGSize(width: bounds.width, height: bounds.width / aspectRatio)
            : CGSize(width: bounds.height * aspectRatio, height: bounds.height)
    }

    private var currentZoom: Double {
        gestureZoom.map { viewModel.zoom * $0 } ?? viewModel.zoom
    }

    /// Zone affichée, geste en cours compris ; le contenu suit le doigt.
    private var displayedRect: CGRect {
        var center = viewModel.center
        if let gestureTranslation {
            let pixelsPerPoint = viewModel.cropRect(zoom: currentZoom, center: center).width / max(frameWidth, 1)
            center.x -= gestureTranslation.width * pixelsPerPoint
            center.y -= gestureTranslation.height * pixelsPerPoint
        }
        return viewModel.cropRect(zoom: currentZoom, center: center)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in gestureTranslation = value.translation }
            .onEnded { _ in commit() }
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in gestureZoom = value.magnification }
            .onEnded { _ in commit() }
    }

    private func commit() {
        let rect = displayedRect
        viewModel.commitCrop(zoom: currentZoom, center: CGPoint(x: rect.midX, y: rect.midY))
        gestureZoom = nil
        gestureTranslation = nil
    }
}

/// Photos du carrousel, dans l'ordre : toucher une photo l'affiche dans le cadre de recadrage.
private struct SelectedPhotosStrip: View {
    let viewModel: CreatePostViewModel

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(Array(viewModel.photos.enumerated()), id: \.element.id) { index, photo in
                    Button {
                        viewModel.select(photo.id)
                    } label: {
                        Image(decorative: photo.image, scale: 1)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 44, height: 44)
                            .clipped()
                            .opacity(index == viewModel.selectedIndex ? 1 : 0.5)
                    }
                    .accessibilityLabel("Photo \(index + 1) sur \(viewModel.photos.count)")
                    .accessibilityAddTraits(index == viewModel.selectedIndex ? .isSelected : [])
                }
            }
            .padding(.horizontal)
        }
        .scrollIndicators(.hidden)
        .padding(.vertical, 8)
    }
}

/// Légende et partage : la publication part dans la file, l'écran se ferme.
private struct CaptionView: View {
    let viewModel: CreatePostViewModel
    let onShared: () -> Void

    var body: some View {
        @Bindable var viewModel = viewModel
        Form {
            Section {
                previews
                    .listRowInsets(EdgeInsets())
                TextField("Ajouter une légende…", text: $viewModel.caption, axis: .vertical)
                    .lineLimit(3 ... 12)
            }
            Section {
                Button {
                    Task {
                        if await viewModel.share() {
                            onShared()
                        }
                    }
                } label: {
                    if viewModel.isSharing {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Partager")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSharing)
                .listRowInsets(EdgeInsets())
            }
        }
        .navigationTitle("Nouvelle publication")
        .navigationBarTitleDisplayMode(.inline)
        .alert(
            "Publication impossible",
            isPresented: Binding(
                get: { viewModel.shareErrorMessage != nil },
                set: {
                    if !$0 {
                        viewModel.shareErrorMessage = nil
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.shareErrorMessage ?? "")
        }
    }

    /// Photos recadrées, comme elles seront publiées ; en carrousel quand il y en a plusieurs (Instagram).
    private var previews: some View {
        let images = viewModel.croppedPreviews
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                    Image(image, scale: 1, label: Text(images.count > 1 ? "Photo \(index + 1) sur \(images.count)" : "Photo"))
                        .resizable()
                        .scaledToFit()
                        .frame(height: 280)
                }
            }
            .padding()
        }
        .scrollIndicators(.hidden)
        .frame(maxWidth: .infinity)
    }
}
