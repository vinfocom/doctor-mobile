import client from './client';

export const login = async (email: string, password: string) => {
    const response = await client.post('/auth/login', { email, password });
    return response.data;
};

export const getProfile = async () => {
    const response = await client.get('/doctors/me');
    return response.data;
};
