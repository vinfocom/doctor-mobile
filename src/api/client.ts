import axios from 'axios';
import { getToken } from './token';
import { API_URL } from '../config/env';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

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
        if (status === 405) {
            const method = String(error?.config?.method || 'UNKNOWN').toUpperCase();
            const url = error?.config?.baseURL
                ? `${error.config.baseURL}${error?.config?.url || ''}`
                : error?.config?.url || 'unknown-url';
            console.error(`[API 405] ${method} ${url}`);
        }
        return Promise.reject(error);
    }
);

export default client;
