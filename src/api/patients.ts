import client from './client';

export const getPatients = async () => {
    const response = await client.get('/patients');
    return response.data;
};

export const createPatient = async (data: any) => {
    const response = await client.post('/patients', data);
    return response.data;
};
