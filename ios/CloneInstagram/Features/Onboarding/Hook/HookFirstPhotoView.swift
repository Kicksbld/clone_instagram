import PhotosUI
import SwiftUI
import UIKit

/// « Learn by doing » : une photo prise ou choisie, un filtre, puis « Publier » dans un faux feed. La photo
/// reste dans l'app et sera proposée comme photo de profil après la création du compte.
struct HookFirstPhotoView: View {
    let viewModel: OnboardingHookViewModel
    @State private var isCameraPresented = false
    @State private var isPickerPresented = false
    @State private var selection: PhotosPickerItem?
    /// Photo décodée et réduite une fois par choix (pas à chaque rendu).
    @State private var image: UIImage?

    var body: some View {
        HookScaffold(primaryTitle: primaryTitle, primaryAction: primaryAction) {
            HookTitle(text: title, subtitle: subtitle)
            if let image {
                preview(image)
                if !viewModel.isPhotoPublished {
                    filters(image)
                }
            } else {
                viewfinder
            }
        } secondary: {
            if viewModel.photo != nil, !viewModel.isPhotoPublished {
                Button("Changer de photo") { isPickerPresented = true }
                    .buttonStyle(.onboardingSecondary)
            } else if !viewModel.isPhotoPublished {
                Button("Pas maintenant", action: viewModel.next)
                    .buttonStyle(.onboardingSecondary)
            }
        }
        .animation(.spring(duration: 0.5, bounce: 0.35), value: viewModel.isPhotoPublished)
        .task(id: viewModel.photoRevision) {
            if let data = viewModel.photo {
                image = await Self.displayImage(from: data)
            } else {
                image = nil
            }
        }
        .photosPicker(isPresented: $isPickerPresented, selection: $selection, matching: .images)
        .onChange(of: selection) { _, item in
            guard let item else { return }
            selection = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    viewModel.photoChosen(data, method: .library)
                } else {
                    viewModel.photoLoadFailed()
                }
            }
        }
        .fullScreenCover(isPresented: $isCameraPresented) {
            SystemPhotoCamera { data in
                isCameraPresented = false
                if let data {
                    viewModel.photoChosen(data, method: .camera)
                }
            }
            .ignoresSafeArea()
        }
    }

    /// Réduite à 1 080 px de côté au plus : suffisant pour l'écran et les vignettes de filtres.
    private static func displayImage(from data: Data) async -> UIImage? {
        guard let image = UIImage(data: data) else { return nil }
        let scale = min(1, 1080 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        return await image.byPreparingThumbnail(ofSize: size) ?? image
    }

    private var title: String {
        if viewModel.isPhotoPublished {
            "Publié !"
        } else if viewModel.photo == nil {
            "Ta première photo"
        } else {
            "Choisis un filtre"
        }
    }

    private var subtitle: String {
        if viewModel.isPhotoPublished {
            "Voilà ton post dans le feed. Simple, non ?"
        } else if viewModel.photo == nil {
            "Prends ou choisis une photo : on la publie ensemble, pour de faux."
        } else {
            "Touche un filtre pour l'essayer."
        }
    }

    private var primaryTitle: String {
        if viewModel.isPhotoPublished {
            "Continuer"
        } else if viewModel.photo != nil {
            "Publier"
        } else if SystemPhotoCamera.isAvailable {
            "Prendre une photo"
        } else {
            "Choisir une photo"
        }
    }

    private func primaryAction() {
        if viewModel.isPhotoPublished {
            viewModel.next()
        } else if viewModel.photo != nil {
            viewModel.publishPhoto()
        } else if SystemPhotoCamera.isAvailable {
            isCameraPresented = true
        } else {
            isPickerPresented = true
        }
    }

    private var viewfinder: some View {
        VStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 32)
                    .strokeBorder(Color.cloneLime, style: StrokeStyle(lineWidth: 4, dash: [18, 12]))
                Image(systemName: "camera.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Color.cloneLime)
                    .symbolEffect(.pulse)
            }
            .aspectRatio(1, contentMode: .fit)
            .accessibilityHidden(true)
            if SystemPhotoCamera.isAvailable {
                Button("Choisir dans la galerie", systemImage: "photo.on.rectangle") { isPickerPresented = true }
                    .buttonStyle(.onboardingSecondary)
            }
        }
    }

    private func preview(_ image: UIImage) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if viewModel.isPhotoPublished {
                HStack(spacing: 10) {
                    Image(systemName: "person.crop.circle.fill").font(.title2).accessibilityHidden(true)
                    Text("Toi").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("À l'instant").font(.footnote).foregroundStyle(Color.onboardingSecondaryText)
                }
                .padding(12)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .photoFilter(viewModel.photoFilter)
                .frame(maxWidth: .infinity)
                .aspectRatio(1, contentMode: .fit)
                .clipped()
                .accessibilityLabel("Ta photo, sans description")
            if viewModel.isPhotoPublished {
                HStack(spacing: 16) {
                    Image(systemName: "heart").accessibilityHidden(true)
                    Image(systemName: "bubble.right").accessibilityHidden(true)
                    Image(systemName: "paperplane").accessibilityHidden(true)
                    Spacer()
                }
                .font(.title3)
                .padding(12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(Color.onboardingSurface)
        .clipShape(.rect(cornerRadius: 24))
        .scaleEffect(viewModel.isPhotoPublished ? 0.92 : 1)
    }

    private func filters(_ image: UIImage) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(OnboardingPhotoFilter.allCases) { filter in
                    FilterThumbnail(image: image, filter: filter, isSelected: viewModel.photoFilter == filter) {
                        viewModel.photoFilter = filter
                    }
                }
            }
        }
    }
}

private struct FilterThumbnail: View {
    let image: UIImage
    let filter: OnboardingPhotoFilter
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.feedback) private var feedback

    var body: some View {
        Button {
            feedback.play(.tick)
            action()
        } label: {
            VStack(spacing: 6) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .photoFilter(filter)
                    .frame(width: 72, height: 72)
                    .clipShape(.rect(cornerRadius: 14))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(isSelected ? Color.cloneLime : .clear, lineWidth: 3)
                    }
                Text(filter.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(isSelected ? Color.cloneLime : .white)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(filter.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private extension View {
    @ViewBuilder
    func photoFilter(_ filter: OnboardingPhotoFilter) -> some View {
        switch filter {
        case .original: self
        case .citron: colorMultiply(Color(red: 0.92, green: 1, blue: 0.72)).saturation(1.15)
        case .vivid: saturation(1.6).contrast(1.15)
        case .noir: grayscale(1).contrast(1.25)
        }
    }
}
