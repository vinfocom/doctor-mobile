import client from './client';

export const getSlots = async (date: string, clinicId: number) => {
    const response = await client.get(`/slots?date=${date}&clinicId=${clinicId}`);
    return response.data;
};
