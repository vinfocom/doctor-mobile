import { API_URL } from '../config/env';
import { getToken } from './token';
import client from './client';
import { getPrescriptionErrorMessage } from '../lib/prescriptionErrors';

export type PrescriptionUploadFile = {
    uri: string;
    name: string;
    type: string;
};

export const createPrescriptionRecord = async (data: {
    patient_id: number;
    doctor_id: number;
    clinic_id?: number | null;
    appointment_id?: number | null;
    note?: string | null;
}) => {
    const response = await client.post('/prescriptions', data);
    return response.data;
};

export const createPrescriptionUpload = async (
    data: {
        patient_id: number;
        doctor_id: number;
        clinic_id?: number | null;
        appointment_id?: number | null;
        note?: string | null;
    },
    files: PrescriptionUploadFile[]
) => {
    const token = await getToken();
    if (!token) {
        throw new Error('Missing auth token');
    }

    const formData = new FormData();
    formData.append('patient_id', String(data.patient_id));
    formData.append('doctor_id', String(data.doctor_id));
    if (data.clinic_id) {
        formData.append('clinic_id', String(data.clinic_id));
    }
    if (data.appointment_id) {
        formData.append('appointment_id', String(data.appointment_id));
    }
    if (data.note?.trim()) {
        formData.append('note', data.note.trim());
    }

    files.forEach((file) => {
        formData.append('files', {
            uri: file.uri,
            name: file.name,
            type: file.type,
        } as any);
    });

    const response = await fetch(`${API_URL}/prescriptions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const responseText = await response.text();
    let dataResponse: any = {};
    if (responseText) {
        try {
            dataResponse = JSON.parse(responseText);
        } catch {
            dataResponse = {};
        }
    }
    if (!response.ok) {
        throw new Error(getPrescriptionErrorMessage(
            { response: { status: response.status, data: dataResponse } },
            'Upload failed'
        ));
    }

    return dataResponse;
};

export const listPrescriptions = async (params: {
    patient_id: number;
    doctor_id: number;
}) => {
    const response = await client.get(
        `/prescriptions?patient_id=${params.patient_id}&doctor_id=${params.doctor_id}`
    );
    return response.data;
};

export const deletePrescriptionRecord = async (params: {
    prescription_id: number;
    patient_id: number;
    doctor_id: number;
}) => {
    const response = await client.delete(
        `/prescriptions/${params.prescription_id}?patient_id=${params.patient_id}&doctor_id=${params.doctor_id}`
    );
    return response.data;
};

export const uploadPrescriptionPages = async (
    params: {
        prescription_id: number;
        patient_id: number;
        doctor_id: number;
    },
    files: PrescriptionUploadFile[]
) => {
    const token = await getToken();
    if (!token) {
        throw new Error('Missing auth token');
    }

    const formData = new FormData();
    formData.append('patient_id', String(params.patient_id));
    formData.append('doctor_id', String(params.doctor_id));
    files.forEach((file) => {
        formData.append('files', {
            uri: file.uri,
            name: file.name,
            type: file.type,
        } as any);
    });

    const response = await fetch(`${API_URL}/prescriptions/${params.prescription_id}/pages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.detail || data?.error || 'Upload failed');
    }

    return data;
};
