import client from './client';

export const getPatientAppointments = async () => {
    const response = await client.get('/patient/appointments');
    return response.data;
};

export const createPatientAppointment = async (data: {
    doctor_id: number;
    clinic_id: number;
    appointment_date: string;
    start_time: string;
    booking_for?: 'SELF' | 'OTHER';
    patient_name?: string;
}) => {
    const response = await client.post('/patient/appointments', data);
    return response.data;
};

export const updatePatientAppointment = async (data: {
    appointmentId: number;
    status?: string;
    appointment_date?: string;
    start_time?: string;
    end_time?: string;
    rescheduled_by?: string;
    cancelled_by?: string;
}) => {
    const response = await client.patch('/patient/appointments', data);
    return response.data;
};

