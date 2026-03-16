import client from './client';

export interface StaffMember {
    staff_id: number;
    user_id: number;
    name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    valid_from: string | null;
    valid_to: string | null;
    created_at: string;
    clinic_id: number | null;
    clinic_name: string | null;
    doctor_whatsapp_number?: string | null;
}

export interface StaffPayload {
    username: string;
    email?: string;
    password?: string;
    role: string;
    status: string;
    clinic_id: string;
    is_limited: boolean;
    valid_from: string;
    valid_to: string;
    doctor_whatsapp_number?: string;
}

export const getStaff = async (): Promise<{ staff: StaffMember[] }> => {
    const response = await client.get('/doctor/staff');
    return response.data;
};

export const createStaff = async (data: StaffPayload) => {
    const response = await client.post('/doctor/staff', data);
    return response.data;
};

export const updateStaff = async (staffId: number, data: Omit<StaffPayload, 'email' | 'password'>) => {
    const response = await client.put(`/doctor/staff/${staffId}`, data);
    return response.data;
};

export const deleteStaff = async (staffId: number) => {
    const response = await client.delete(`/doctor/staff/${staffId}`);
    return response.data;
};
