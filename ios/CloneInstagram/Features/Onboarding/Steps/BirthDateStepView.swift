import SwiftUI

struct BirthDateStepView: View {
    @Bindable var viewModel: OnboardingViewModel

    var body: some View {
        OnboardingStepLayout(
            title: "Quelle est votre date de naissance ?",
            subtitle: """
            Utilisez votre propre date de naissance, même si ce compte est destiné à une entreprise ou autre. \
            Elle ne sera pas visible sur votre profil.
            """,
            errorMessage: viewModel.errorMessage,
            primaryAction: viewModel.submitBirthDate
        ) {
            DatePicker("Date de naissance", selection: $viewModel.birthDate, in: ...Date.now, displayedComponents: .date)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: .infinity)
        }
    }
}
