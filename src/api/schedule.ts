import client from './client';

export const getSchedule = async (doctorId?: number) => {
    const url = doctorId ? `/schedule?doctorId=${doctorId}` : '/schedule';
    const response = await client.get(url);
    return response.data;
};

export const createSchedule = async (data: any) => {
    const response = await client.patch('/schedule', data);
    return response.data;
};

export const updateSchedule = async (data: any) => {
    const response = await client.patch('/schedule', data);
    return response.data;
};

export const deleteSchedule = async (scheduleId: number) => {
    const response = await client.delete(`/schedule?scheduleId=${scheduleId}`);
    return response.data;
};
