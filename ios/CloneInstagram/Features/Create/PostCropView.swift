import SwiftUI

/// Cadre de recadrage : la zone affichée est exactement celle qui sera publiée (pincer pour zoomer,
/// glisser pour déplacer) ; le bouton en bas à gauche bascule entre carré et ratio d'origine.
struct CropView: View {
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
            if viewModel.keepsEntireImage {
                Image(decorative: image, scale: 1).resizable().scaledToFit()
                    .frame(width: frame.width, height: frame.height)
                    .background(.black)
                    .frame(width: proxy.size.width, height: proxy.size.height)
            } else {
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
        }
        .aspectRatio(1, contentMode: .fit)
        .onGeometryChange(for: CGFloat.self) { [aspectRatio = viewModel.aspectRatio] proxy in
            Self.frameSize(in: proxy.size, aspectRatio: aspectRatio).width
        } action: { width in
            frameWidth = width
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Recadrage de la photo \(viewModel.selectedIndex + 1)")
        .accessibilityValue("Zoom \(viewModel.zoom.formatted(.number.precision(.fractionLength(1))))")
        .accessibilityActions {
            Button("Zoomer") { viewModel.commitCrop(zoom: viewModel.zoom + 0.25, center: viewModel.center) }
            Button("Dézoomer") { viewModel.commitCrop(zoom: viewModel.zoom - 0.25, center: viewModel.center) }
            Button("Déplacer le cadre à gauche") { viewModel.moveCrop(horizontal: -0.1, vertical: 0) }
            Button("Déplacer le cadre à droite") { viewModel.moveCrop(horizontal: 0.1, vertical: 0) }
            Button("Déplacer le cadre vers le haut") { viewModel.moveCrop(horizontal: 0, vertical: -0.1) }
            Button("Déplacer le cadre vers le bas") { viewModel.moveCrop(horizontal: 0, vertical: 0.1) }
            Button("Conserver l’image entière") { viewModel.keepEntireImage() }
        }
        .overlay(alignment: .bottomTrailing) {
            Menu("Ajuster le cadrage", systemImage: "crop") {
                Button("Zoomer") { viewModel.commitCrop(zoom: viewModel.zoom + 0.25, center: viewModel.center) }
                Button("Dézoomer") { viewModel.commitCrop(zoom: viewModel.zoom - 0.25, center: viewModel.center) }
                Button("Déplacer à gauche") { viewModel.moveCrop(horizontal: -0.1, vertical: 0) }
                Button("Déplacer à droite") { viewModel.moveCrop(horizontal: 0.1, vertical: 0) }
                Button("Déplacer vers le haut") { viewModel.moveCrop(horizontal: 0, vertical: -0.1) }
                Button("Déplacer vers le bas") { viewModel.moveCrop(horizontal: 0, vertical: 0.1) }
                Button("Conserver l’image entière") { viewModel.keepEntireImage() }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.bordered)
            .padding(12)
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
struct SelectedPhotosStrip: View {
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
