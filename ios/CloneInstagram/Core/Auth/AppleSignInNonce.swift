import CryptoKit
import Foundation

/// Nonce d'une demande Sign in with Apple : Apple reçoit l'empreinte, Supabase le nonce en clair (ADR-018).
struct AppleSignInNonce: Equatable {
    let raw: String

    var hashed: String {
        SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func random() -> AppleSignInNonce {
        var generator = SystemRandomNumberGenerator()
        let bytes = (0 ..< 32).map { _ in UInt8.random(in: .min ... .max, using: &generator) }
        return AppleSignInNonce(raw: Data(bytes).base64EncodedString())
    }
}
