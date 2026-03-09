import client from './client';

export const getAllDoctors = async () => {
    const response = await client.get('/doctors');
    return response.data;
};
