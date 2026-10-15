import Testing
@testable import CloneInstagram

struct AppIconViewModelTests {
    @Test func `abonné Plus → icône changée`() async {
        let service = FakeAppIconService()
        let viewModel = AppIconViewModel(service: service)

        await viewModel.select(.citron, isPlus: true)

        #expect(service.changes == [.citron])
        #expect(viewModel.selected == .citron)
    }

    @Test func `sans Plus selon l'API → icône inchangée`() async {
        let service = FakeAppIconService()
        let viewModel = AppIconViewModel(service: service)

        await viewModel.select(.citron, isPlus: false)

        #expect(service.changes.isEmpty)
        #expect(viewModel.selected == .standard)
    }

    @Test func `refus du système → message, sélection conservée`() async {
        let service = FakeAppIconService()
        service.error = .failed
        let viewModel = AppIconViewModel(service: service)

        await viewModel.select(.rose, isPlus: true)

        #expect(viewModel.selected == .standard)
        #expect(viewModel.message != nil)
    }
}
