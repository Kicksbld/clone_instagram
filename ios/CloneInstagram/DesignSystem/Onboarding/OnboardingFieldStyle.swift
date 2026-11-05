import SwiftUI

extension View {
    /// Champ de saisie de l'onboarding : surface claire arrondie sur fond noir.
    func onboardingField() -> some View {
        textFieldStyle(.plain)
            .font(.onboardingBody(.body, weight: .medium))
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 54)
            .background(Color.onboardingSurface, in: .rect(cornerRadius: 16))
    }
}
