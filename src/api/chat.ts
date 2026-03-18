import client from './client';

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
    const formData = new FormData();
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    formData.append('patient_id', String(meta.patient_id));
    formData.append('doctor_id', String(meta.doctor_id));

    const response = await client.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};
