import Foundation
import Testing
@testable import CloneInstagram

struct BirthDateTests {
    @Test func `format du contrat AAAA-MM-JJ`() {
        #expect(BirthDate(year: 2000, month: 1, day: 5).iso8601 == "2000-01-05")
    }

    @Test func `jour lu dans le calendrier de l'utilisateur`() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Pacific/Auckland"))
        let date = try #require(calendar.date(from: DateComponents(year: 2000, month: 1, day: 31, hour: 0, minute: 30)))

        #expect(BirthDate(date, calendar: calendar) == BirthDate(year: 2000, month: 1, day: 31))
    }

    @Test(arguments: [
        (2013, 9, 25, 13),
        (2013, 9, 26, 12),
        (2000, 1, 31, 26),
    ])
    func `âge en années révolues au 25 septembre 2026`(year: Int, month: Int, day: Int, age: Int) {
        let birthDate = BirthDate(year: year, month: month, day: day)
        #expect(birthDate.age(on: BirthDate(year: 2026, month: 9, day: 25)) == age)
    }
}
