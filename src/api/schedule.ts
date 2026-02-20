import client from './client';

export const getSchedule = async (doctorId?: number) => {
    const url = doctorId ? `/schedule?doctorId=${doctorId}` : '/schedule';
    const response = await client.get(url);
    return response.data;
};

export const createSchedule = async (data: any) => {
    const response = await client.post('/schedule', data);
    return response.data;
};
