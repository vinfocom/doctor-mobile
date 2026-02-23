import client from './client';

export const login = async (email: string, password: string) => {
    const response = await client.post('/auth/login', { email, password });
    return response.data;
};

export const getProfile = async () => {
    const response = await client.get('/doctors/me');
    return response.data;
};

export const patientLogin = async (identifier: string) => {
    const response = await client.post('/patient-auth/login', { identifier });
    return response.data;
};

export const getPatientProfile = async () => {
    const response = await client.get('/patient/me');
    return response.data;
};
