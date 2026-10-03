import CircleModularWalletsCore
import ExpoModulesCore
import Foundation

public final class CircleModularWalletsNativeModule: Module {
  private var account: WebAuthnAccount?

  public func definition() -> ModuleDefinition {
    Name("CircleModularWalletsNative")

    AsyncFunction("rpcHeaders") { () throws -> [String: String] in
      guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else {
        throw CircleNativeAppMetadataException()
      }
      return ["X-AppInfo": "platform=ios;version=1.5.0;bundleid=\(bundleId)"]
    }

    AsyncFunction("register") {
      (clientKey: String, clientUrl: String, userName: String) async throws -> [String: Any] in
      let transport = toPasskeyTransport(clientKey: clientKey, url: clientUrl)
      let credential = try await toWebAuthnCredential(
        transport: transport,
        userName: userName,
        mode: .register
      )
      self.account = toWebAuthnAccount(credential)
      return self.serializeCredential(credential, includeRegistration: true)
    }

    AsyncFunction("login") {
      (clientKey: String, clientUrl: String) async throws -> [String: Any] in
      let transport = toPasskeyTransport(clientKey: clientKey, url: clientUrl)
      let credential = try await toWebAuthnCredential(
        transport: transport,
        mode: .login
      )
      self.account = toWebAuthnAccount(credential)
      return self.serializeCredential(credential, includeRegistration: false)
    }

    AsyncFunction("sign") { (messageHash: String) async throws -> [String: Any] in
      guard let account = self.account else {
        throw CircleNativeCredentialNotHydratedException()
      }

      let result = try await account.sign(messageHash: messageHash)
      return self.serializeSignResult(result)
    }
  }

  private func serializeCredential(
    _ credential: WebAuthnCredential,
    includeRegistration: Bool
  ) -> [String: Any] {
    var result: [String: Any] = [
      "id": credential.id,
      "publicKey": credential.publicKey,
      "rpId": credential.rpId
    ]

    if includeRegistration,
       let registration = credential.raw as? RegistrationCredential,
       let response = registration.response as? AuthenticatorAttestationResponse {
      result["registration"] = [
        "id": registration.id,
        "rawId": registration.rawID.asString(),
        "type": registration.type.rawValue,
        "authenticatorAttachment": registration.authenticatorAttachment?.rawValue as Any,
        "response": [
          "clientDataJSON": response.clientDataJSON.asString(),
          "attestationObject": response.attestationObject.asString(),
          "publicKey": response.publicKey?.asString() as Any,
          "transports": response.transports ?? []
        ]
      ] as [String: Any]
    }

    return result
  }

  private func serializeSignResult(_ result: SignResult) -> [String: Any] {
    let raw = result.raw
    let response = raw.response as? AuthenticatorAssertionResponse

    return [
      "signature": result.signature,
      "webauthn": [
        "authenticatorData": result.webAuthn.authenticatorData,
        "clientDataJSON": result.webAuthn.clientDataJSON,
        "challengeIndex": result.webAuthn.challengeIndex,
        "typeIndex": result.webAuthn.typeIndex,
        "userVerificationRequired": result.webAuthn.userVerificationRequired
      ],
      "raw": [
        "id": raw.id,
        "rawId": raw.rawID.asString(),
        "type": raw.type.rawValue,
        "authenticatorAttachment": raw.authenticatorAttachment?.rawValue as Any,
        "response": [
          "clientDataJSON": response?.clientDataJSON.asString() ?? "",
          "authenticatorData": response?.authenticatorData.asString() ?? "",
          "signature": response?.signature.asString() ?? "",
          "userHandle": response?.userHandle?.asString() as Any
        ]
      ]
    ]
  }
}

private final class CircleNativeCredentialNotHydratedException: Exception {
  override var reason: String {
    "Circle native passkey account is not hydrated. Register or reconnect the credential before signing."
  }
}

private final class CircleNativeAppMetadataException: Exception {
  override var reason: String {
    "The app bundle identifier is unavailable. Build and sign a native development client."
  }
}
