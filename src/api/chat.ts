import client from './client';
import { API_URL } from '../config/env';
import { getToken } from './token';

export const getChatMessages = async (patientId: number, doctorId: number) => {
    const response = await client.get(`/chat?patient_id=${patientId}&doctor_id=${doctorId}`);
    return response.data;
};

export const sendChatMessage = async (data: {
    patient_id: number;
    doctor_id: number;
    sender: 'DOCTOR' | 'PATIENT';
    content?: string;
    attachment_url?: string;
    attachment_type?: 'image' | 'file';
    attachment_name?: string;
    attachment_mime?: string;
    attachment_size?: number;
}) => {
    const response = await client.post('/chat', data);
    return response.data;
};

export const uploadChatAttachment = async (
    file: { uri: string; name: string; type: string },
    meta: { patient_id: number; doctor_id: number }
) => {
    const token = await getToken();
    if (!token) {
        throw new Error('Missing auth token');
    }

    const formData = new FormData();
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    formData.append('patient_id', String(meta.patient_id));
    formData.append('doctor_id', String(meta.doctor_id));

    const response = await fetch(`${API_URL}/chat/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.detail || data?.error || 'Upload failed');
    }

    return data;
};
