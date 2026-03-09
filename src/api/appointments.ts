import client from './client';

export const getAppointments = async (params?: { date?: string }) => {
    const query = params?.date ? `?date=${params.date}` : '';
    const response = await client.get(`/appointments${query}`);
    return response.data;
};

export const createAppointment = async (data: any) => {
    const response = await client.post('/appointments', data);
    return response.data;
};

export const updateAppointment = async (data: any) => {
    const response = await client.patch('/appointments', data);
    return response.data;
};

export const deleteAppointment = async (appointmentId: number) => {
    const response = await client.delete(`/appointments?appointmentId=${appointmentId}`);
    return response.data;
};
