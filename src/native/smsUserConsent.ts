import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type SmsConsentPayload = {
    message?: string;
};

type SmsConsentSubscription = {
    remove: () => void;
};

const MODULE_NAME = 'SmsUserConsentModule';
const SmsUserConsentModule = NativeModules[MODULE_NAME] as
    | {
        startSmsUserConsent: () => Promise<boolean>;
        removeSmsListener?: () => void;
        addListener: (eventName: string) => void;
        removeListeners: (count: number) => void;
    }
    | undefined;

const smsEmitter = SmsUserConsentModule ? new NativeEventEmitter(SmsUserConsentModule) : null;

export async function startSmsUserConsent() {
    if (Platform.OS !== 'android' || !SmsUserConsentModule?.startSmsUserConsent) {
        throw new Error('SMS User Consent is unavailable on this device');
    }

    return SmsUserConsentModule.startSmsUserConsent();
}

export function addSmsListener(handler: (payload: SmsConsentPayload) => void): SmsConsentSubscription | null {
    if (!smsEmitter) return null;
    return smsEmitter.addListener('SmsUserConsent:smsReceived', handler);
}

export function addSmsDeniedListener(handler: () => void): SmsConsentSubscription | null {
    if (!smsEmitter) return null;
    return smsEmitter.addListener('SmsUserConsent:smsDenied', handler);
}

export function addSmsErrorListener(handler: (payload: SmsConsentPayload) => void): SmsConsentSubscription | null {
    if (!smsEmitter) return null;
    return smsEmitter.addListener('SmsUserConsent:error', handler);
}

export function removeSmsListener() {
    SmsUserConsentModule?.removeSmsListener?.();
}
