import client from './client';

export const getSlots = async (date: string, clinicId: number, doctorId?: number) => {
    const params = new URLSearchParams({
        date,
        clinicId: String(clinicId),
    });
    if (doctorId) params.set('doctorId', String(doctorId));
    const response = await client.get(`/slots?${params.toString()}`);
    return response.data;
};
