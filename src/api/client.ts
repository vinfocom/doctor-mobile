import axios from 'axios';
import { getToken } from './token';
import { API_URL } from '../config/env';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

if (__DEV__) {
    console.log(`[api] baseURL=${API_URL}`);
}

client.interceptors.request.use(
    async (config) => {
        const token = await getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

client.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const method = String(error?.config?.method || 'UNKNOWN').toUpperCase();
        const url = error?.config?.baseURL
            ? `${error.config.baseURL}${error?.config?.url || ''}`
            : error?.config?.url || 'unknown-url';

        if (__DEV__) {
            console.error(
                `[api] ${method} ${url} -> status=${status ?? 'none'} code=${error?.code ?? 'none'} message=${error?.message ?? 'unknown'}`
            );
        }

        if (status === 405) {
            console.error(`[API 405] ${method} ${url}`);
        }
        return Promise.reject(error);
    }
);

export default client;
