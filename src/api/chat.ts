import client from './client';

export const getChatMessages = async (patientId: number, doctorId: number) => {
    const response = await client.get(`/chat?patient_id=${patientId}&doctor_id=${doctorId}`);
    return response.data;
};

export const sendChatMessage = async (data: { patient_id: number; doctor_id: number; sender: 'DOCTOR' | 'PATIENT'; content: string }) => {
    const response = await client.post('/chat', data);
    return response.data;
};
