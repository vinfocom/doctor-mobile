import client from './client';

export const getAppointments = async () => {
    const response = await client.get('/appointments');
    return response.data;
};

export const createAppointment = async (data: any) => {
    const response = await client.post('/appointments', data);
    return response.data;
};
