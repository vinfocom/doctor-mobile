import client from './client';

export const getPatients = async () => {
    const response = await client.get('/patients');
    return response.data;
};

export const createPatient = async (data: any) => {
    const response = await client.post('/patients', data);
    return response.data;
};

export const updatePatient = async (
    patientId: number,
    data: {
        full_name?: string;
        phone?: string;
        age?: number | null;
        gender?: string | null;
        appointment_id?: number;
    }
) => {
    const response = await client.patch(`/patients/${patientId}`, data);
    return response.data as {
        patient: {
            patient_id: number;
            full_name?: string | null;
            phone?: string | null;
            age?: number | null;
            gender?: string | null;
        };
        linked_patient_ids?: number[];
    };
};
