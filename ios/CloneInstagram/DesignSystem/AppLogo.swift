import SwiftUI

/// Emplacement du logo (wireframe) : symbole système en attendant la tranche de style.
struct AppLogo: View {
    var body: some View {
        Image(systemName: "camera")
            .font(.system(size: 64))
            .accessibilityLabel("Clone")
    }
}
