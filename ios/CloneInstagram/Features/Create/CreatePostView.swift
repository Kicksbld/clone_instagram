import PhotosUI
import SwiftUI

/// Nouvelle publication (wireframe, parcours d'Instagram) : photo et recadrage, puis légende et « Partager ».
struct CreatePostView: View {
    @State private var viewModel: CreatePostViewModel
    @State private var selection: PhotosPickerItem?
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
                PhotosPicker(selection: $selection, matching: .images, preferredItemEncoding: .current) {
                    Text("Choisir une photo")
                }
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
            .onChange(of: selection) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        await viewModel.loadPhoto(data)
                    } else {
                        viewModel.photoLoadFailed()
                    }
                }
            }
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

/// Légende et partage : la publication part dans la file, l'écran se ferme.
private struct CaptionView: View {
    let viewModel: CreatePostViewModel
    let onShared: () -> Void

    var body: some View {
        @Bindable var viewModel = viewModel
        Form {
            HStack(alignment: .top, spacing: 12) {
                if let preview = viewModel.croppedPreview {
                    Image(decorative: preview, scale: 1)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 72, height: 72)
                }
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
}
