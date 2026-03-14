import client from './client';

export const getAppointments = async (params?: { date?: string; status?: string; dateFrom?: string; dateTo?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.date) searchParams.set('date', params.date);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
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
