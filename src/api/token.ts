import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';

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

export const removeToken = async () => {
    if (isWeb) {
        return localStorage.removeItem(TOKEN_KEY);
    }
    return await SecureStore.deleteItemAsync(TOKEN_KEY);
};
