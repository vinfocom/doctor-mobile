import client from './client';
import { API_URL } from '../config/env';

export type PatientEmrPrescriptionItem = {
    prescription_id: number;
    patient_id: number;
    doctor_id: number;
    appointment_id: number | null;
    prescription_no: string;
    visit_date: string;
    finalized_at: string | null;
    doctor_name: string | null;
    clinic_name: string | null;
    pdf_url: string | null;
    version_number: number;
    complaint_summary: string;
    diagnosis_summary: string;
    view_url: string;
    download_url: string;
};

const getApiOrigin = () => {
    try {
        return new URL(API_URL).origin;
    } catch {
        return '';
    }
};

const normalizePatientDocumentUrl = (value: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return trimmed;

    try {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        if (host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost') {
            const apiOrigin = getApiOrigin();
            if (!apiOrigin) return trimmed;
            return `${apiOrigin}${url.pathname}${url.search}`;
        }
        return url.toString();
    } catch {
        return trimmed;
    }
};

export const listPatientEmrPrescriptions = async (params: {
    doctor_id: number;
}) => {
    const response = await client.get(
        `/patient/emr-prescriptions?doctor_id=${params.doctor_id}`
    );
    const data = response.data as { prescriptions: PatientEmrPrescriptionItem[] };

    return {
        prescriptions: (data.prescriptions || []).map((item) => ({
            ...item,
            view_url: normalizePatientDocumentUrl(item.view_url),
            download_url: normalizePatientDocumentUrl(item.download_url),
        })),
    } as { prescriptions: PatientEmrPrescriptionItem[] };
};
