import SwiftUI

extension EnvironmentValues {
    /// Fourni par App : les features peuvent présenter Clone Plus sans importer la feature Billing.
    @Entry var plusPaywall: () -> AnyView = { AnyView(EmptyView()) }
}
