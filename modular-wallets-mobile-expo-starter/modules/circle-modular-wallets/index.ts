import { requireOptionalNativeModule } from 'expo-modules-core';

export type CircleNativeRegistrationCredential = {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment?: string | null;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    publicKey?: string;
    transports?: string[];
  };
};

export type CircleNativeCredential = {
  id: string;
  publicKey: string;
  rpId: string;
  registration?: CircleNativeRegistrationCredential;
};

export type CircleNativeSignResult = {
  signature: string;
  webauthn: {
    authenticatorData: string;
    clientDataJSON: string;
    challengeIndex: number;
    typeIndex: number;
    userVerificationRequired: boolean;
  };
  raw: {
    id: string;
    rawId: string;
    type: string;
    authenticatorAttachment?: string | null;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string | null;
    };
  };
};

export type CircleModularWalletsNativeModule = {
  rpcHeaders(): Promise<Record<string, string>>;
  register(clientKey: string, clientUrl: string, userName: string): Promise<CircleNativeCredential>;
  login(clientKey: string, clientUrl: string): Promise<CircleNativeCredential>;
  sign(messageHash: string): Promise<CircleNativeSignResult>;
};

export function resolveCircleModularWalletsNativeModule(): CircleModularWalletsNativeModule | null {
  return requireOptionalNativeModule<CircleModularWalletsNativeModule>(
    'CircleModularWalletsNative'
  );
}
