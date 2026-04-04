import Constants from 'expo-constants';

const ensureHttpProtocol = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    if (/^https?:\/\//i.test(trimmed)) {
        if (!__DEV__ && /^http:\/\//i.test(trimmed)) {
            throw new Error('[env] In release builds, API and socket URLs must use HTTPS.');
        }
        return trimmed;
    }

    return __DEV__ ? `http://${trimmed}` : `https://${trimmed}`;
};

type PublicEnvName = 'EXPO_PUBLIC_API_URL' | 'EXPO_PUBLIC_SOCKET_URL' | 'EXPO_PUBLIC_APP_VERSION';

type ExpoExtra = {
    apiUrl?: string;
    socketUrl?: string;
    appVersion?: string;
};

const getExpoExtra = (): ExpoExtra => {
    const constantsAny = Constants as unknown as {
        expoConfig?: { extra?: ExpoExtra };
        manifest?: { extra?: ExpoExtra };
        manifest2?: { extra?: ExpoExtra };
    };

    return (
        constantsAny.expoConfig?.extra ??
        constantsAny.manifest2?.extra ??
        constantsAny.manifest?.extra ??
        {}
    ) as ExpoExtra;
};

const getEnvValue = (name: PublicEnvName) => {
    // Keep direct property access so Expo can inline EXPO_PUBLIC_* values in bundles.
    if (name === 'EXPO_PUBLIC_API_URL') return process.env.EXPO_PUBLIC_API_URL;
    if (name === 'EXPO_PUBLIC_SOCKET_URL') return process.env.EXPO_PUBLIC_SOCKET_URL;
    if (name === 'EXPO_PUBLIC_APP_VERSION') return process.env.EXPO_PUBLIC_APP_VERSION;
    return undefined;
};

const readConfigValue = (envName: PublicEnvName, extraName: keyof ExpoExtra) => {
    const envValue = getEnvValue(envName);
    if (envValue) return envValue;

    const extraValue = getExpoExtra()[extraName]?.trim();
    if (extraValue) return extraValue;

    const modeHint = __DEV__
        ? `Set ${envName} in your local env or set expo.extra.${extraName} in app.json.`
        : `Release build is missing ${envName}. Set EAS env or expo.extra.${extraName} in app.json.`;

    throw new Error(`[env] Missing required configuration: ${envName}. ${modeHint}`);
};

const rawApiUrl = ensureHttpProtocol(readConfigValue('EXPO_PUBLIC_API_URL', 'apiUrl'));
const normalized = rawApiUrl.replace(/\/+$/, "");
export const API_URL = normalized.endsWith("/api") ? normalized : `${normalized}/api`;
const rawSocketUrl = readConfigValue('EXPO_PUBLIC_SOCKET_URL', 'socketUrl');
export const SOCKET_URL = ensureHttpProtocol(rawSocketUrl).replace(/\/+$/, "");
export const APP_VERSION =
    (getEnvValue('EXPO_PUBLIC_APP_VERSION') || '').trim() ||
    (getExpoExtra().appVersion || '').trim() ||
    '1.0.0';

if (__DEV__) {
    console.log(`[env] API_URL=${API_URL} SOCKET_URL=${SOCKET_URL} APP_VERSION=${APP_VERSION}`);
}
