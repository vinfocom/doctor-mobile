import client from './client';

export const getClinics = async () => {
    const response = await client.get('/clinics');
    // API returns { clinics: [] }
    return response.data;
};

export const createClinic = async (data: any) => {
    const response = await client.post('/clinics', data);
    return response.data;
};
