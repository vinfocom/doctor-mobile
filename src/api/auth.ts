import client from './client';
import type { AppRole } from './token';

export interface AuthMeUser {
    user_id: number;
    email: string | null;
    name: string | null;
    role: AppRole;
    created_at?: string | null;
    staff_role: string | null;
    staff_clinic_id: number | null;
    staff_doctor_id: number | null;
}

export const login = async (email: string, password: string) => {
    const response = await client.post('/auth/login', { email, password });
    return response.data;
};

export const getMe = async (): Promise<{ user: AuthMeUser }> => {
    const response = await client.get('/auth/me');
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
    chat_id?: string;
    telegram_userid?: string;
    education?: string;
    address?: string;
    registration_no?: string;
    gst_number?: string;
    pan_number?: string;
    profile_pic_url?: string;
    document_url?: string;
    whatsapp_numbers?: { whatsapp_number: string; is_primary: boolean }[];
    push_token?: string;
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
    push_token?: string;
}) => {
    const response = await client.patch('/patient/me', data);
    return response.data;
};
