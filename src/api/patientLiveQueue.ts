import client from './client';

export type PatientLiveQueueData = {
    state: 'ACTIVE' | 'WAITING' | 'MISSED' | 'UNAVAILABLE';
    message?: string;
    clinic_name?: string;
    your_number?: number | null;
    current_number?: number | null;
    next_number?: number | null;
    patients_ahead?: number | null;
};

export const getPatientLiveQueue = async (appointmentId: number) => {
    const response = await client.get('/patient/live-queue', {
        params: { appointmentId },
    });
    return response.data as PatientLiveQueueData;
};
