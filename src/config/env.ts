const ensureHttpProtocol = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const rawApiUrl = ensureHttpProtocol(process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.126:3000/api");
const normalized = rawApiUrl.replace(/\/+$/, "");
export const API_URL = normalized.endsWith("/api") ? normalized : `${normalized}/api`;
export const SOCKET_URL = ensureHttpProtocol(process.env.EXPO_PUBLIC_SOCKET_URL || API_URL.replace(/\/api$/, "")).replace(/\/+$/, "");
