import Photos

/// Galerie de l'iPhone : photo présélectionnée à l'ouverture de la création d'un post, comme Instagram.
protocol PhotoLibrary: Sendable {
    /// Identifiant de la photo la plus récente ; `nil` sans accès à la galerie ou si elle est vide.
    func latestImageIdentifier() async -> String?
}

/// `PhotoLibrary` sur PhotoKit ; demande l'accès à la galerie au premier appel.
nonisolated struct SystemPhotoLibrary: PhotoLibrary {
    func latestImageIdentifier() async -> String? {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized || status == .limited else { return nil }
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = 1
        return PHAsset.fetchAssets(with: .image, options: options).firstObject?.localIdentifier
    }
}
