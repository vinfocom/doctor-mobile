import Constants from 'expo-constants';

const hasHttpProtocol = (url: string) => /^https?:\/\//i.test(url);
const isHttpUrl = (url: string) => /^http:\/\//i.test(url);
const RELEASE_DEFAULT_API_URL = 'https://dapto.vinfocom.co.in/api';
const RELEASE_DEFAULT_SOCKET_URL = 'https://dapto.vinfocom.co.in';

const ensureHttpProtocol = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    if (hasHttpProtocol(trimmed)) {
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

const readConfigValue = (
    envName: PublicEnvName,
    extraName: keyof ExpoExtra,
    releaseFallback?: string
) => {
    const envValue = getEnvValue(envName)?.trim();
    const extraValue = getExpoExtra()[extraName]?.trim();

    if (__DEV__) {
        if (envValue) return envValue;
        if (extraValue) return extraValue;
    } else {
        const releaseCandidates = [envValue, extraValue].filter((value): value is string => Boolean(value));
        const secureCandidate = releaseCandidates.find((value) => !isHttpUrl(value));

        if (secureCandidate) {
            return secureCandidate;
        }

        if (releaseFallback) {
            console.warn(
                `[env] ${envName} resolved to an insecure release URL. Falling back to the bundled production value.`
            );
            return releaseFallback;
        }
    }

    const modeHint = __DEV__
        ? `Set ${envName} in your local env or set expo.extra.${extraName} in app.json.`
        : `Release build is missing ${envName}. Set EAS env or expo.extra.${extraName} in app.json.`;

    if (releaseFallback) {
        console.warn(`[env] Missing ${envName} in release build. Falling back to the bundled production value.`);
        return releaseFallback;
    }

    throw new Error(`[env] Missing required configuration: ${envName}. ${modeHint}`);
};

const rawApiUrl = ensureHttpProtocol(
    readConfigValue('EXPO_PUBLIC_API_URL', 'apiUrl', RELEASE_DEFAULT_API_URL)
);
const normalized = rawApiUrl.replace(/\/+$/, "");
export const API_URL = normalized.endsWith("/api") ? normalized : `${normalized}/api`;
const rawSocketUrl = readConfigValue('EXPO_PUBLIC_SOCKET_URL', 'socketUrl', RELEASE_DEFAULT_SOCKET_URL);
export const SOCKET_URL = ensureHttpProtocol(rawSocketUrl).replace(/\/+$/, "");
export const APP_VERSION =
    (getEnvValue('EXPO_PUBLIC_APP_VERSION') || '').trim() ||
    (getExpoExtra().appVersion || '').trim() ||
    '1.0.0';

if (__DEV__) {
    console.log(`[env] API_URL=${API_URL} SOCKET_URL=${SOCKET_URL} APP_VERSION=${APP_VERSION}`);
}
