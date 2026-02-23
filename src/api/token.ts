import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const ROLE_KEY = 'auth_role';
export type AppRole = 'DOCTOR' | 'PATIENT';

// Helper to handle web vs native storage
const isWeb = Platform.OS === 'web';

export const getToken = async () => {
    if (isWeb) {
        return localStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const setToken = async (token: string) => {
    if (isWeb) {
        return localStorage.setItem(TOKEN_KEY, token);
    }
    return await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getRole = async (): Promise<AppRole | null> => {
    if (isWeb) {
        return (localStorage.getItem(ROLE_KEY) as AppRole | null) || null;
    }
    return (await SecureStore.getItemAsync(ROLE_KEY)) as AppRole | null;
};

export const setRole = async (role: AppRole) => {
    if (isWeb) {
        return localStorage.setItem(ROLE_KEY, role);
    }
    return await SecureStore.setItemAsync(ROLE_KEY, role);
};

export const setAuthSession = async (token: string, role: AppRole) => {
    await setToken(token);
    await setRole(role);
};

export const removeToken = async () => {
    if (isWeb) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ROLE_KEY);
        return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(ROLE_KEY);
};
