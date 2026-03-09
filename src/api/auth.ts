import client from './client';

export const login = async (email: string, password: string) => {
    const response = await client.post('/auth/login', { email, password });
    return response.data;
};

export const getProfile = async () => {
    const response = await client.get('/doctors/me');
    return response.data;
};

export const updateProfile = async (data: {
    doctor_name?: string;
    phone?: string;
    specialization?: string;
    whatsapp_numbers?: { whatsapp_number: string; is_primary: boolean }[];
}) => {
    const response = await client.patch('/doctors/me', data);
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

export const updatePatientProfile = async (data: {
    full_name?: string;
    phone?: string;
    age?: number | string;
    gender?: string;
}) => {
    const response = await client.patch('/patient/me', data);
    return response.data;
};
