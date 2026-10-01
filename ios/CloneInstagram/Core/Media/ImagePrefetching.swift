import Foundation
import Nuke

/// Préchargement des images à venir (ADR-010) : le feed demande les photos des posts suivants avant qu'ils
/// n'apparaissent, pour un scroll sans attente.
protocol ImagePrefetching {
    func prefetch(_ urls: [URL])
}

/// Nuke : même pipeline et même cache que `LazyImage`, qui retrouve l'image déjà décodée.
final class NukeImagePrefetcher: ImagePrefetching {
    private let prefetcher = ImagePrefetcher()

    func prefetch(_ urls: [URL]) {
        prefetcher.startPrefetching(with: urls)
    }
}
