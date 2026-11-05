import SwiftUI

/// Réponse d'un quiz : symbole et libellé, citron une fois choisie, rebond et repère `tick`.
struct ChoiceChip: View {
    let title: String
    let symbol: String
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.feedback) private var feedback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button {
            feedback.play(.tick)
            action()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.title3)
                    .frame(width: 28)
                    .symbolEffect(.bounce, value: isSelected && !reduceMotion)
                Text(title)
                    .font(.onboardingBody(.body, weight: .semibold))
                Spacer()
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .contentTransition(.symbolEffect(.replace))
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .foregroundStyle(isSelected ? Color.onboardingBackground : .white)
            .background(isSelected ? Color.cloneLime : Color.onboardingSurface, in: .rect(cornerRadius: 18))
            .scaleEffect(isSelected && !reduceMotion ? 1.02 : 1)
            .animation(.spring(duration: 0.3, bounce: 0.5), value: isSelected)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
