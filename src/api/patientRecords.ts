import { API_URL } from '../config/env';
import { getToken } from './token';
import { parseApiResponse } from './responseParsing';

export type PatientRecordPage = {
    record_id?: string;
    page_number: number;
    image_path: string;
    uri?: string;
    latitude?: number | null;
    longitude?: number | null;
    location_accuracy_m?: number | null;
};

export type PatientRecord = {
    record_id: string;
    category: 'PRESCRIPTION' | 'LAB_REPORT' | 'IMAGING' | 'OTHER';
    title: string | null;
    for_label: string;
    relationship_label: string | null;
    doctor_id: number | null;
    doctor_name: string | null;
    note: string | null;
    created_at: string;
    pages: PatientRecordPage[];
};

export type PatientRecordDraft = {
    local_id: string;
    owner_patient_id: number;
    title: string;
    category: PatientRecord['category'];
    for_label: string;
    relationship_label: string;
    doctor_id: number | null;
    note: string;
    files: { uri: string; name: string; type: string }[];
    latitude: number | null;
    longitude: number | null;
    location_accuracy_m: number | null;
    created_at: string;
    auto_retry_count?: number;
    next_auto_retry_at?: string | null;
    auto_retry_exhausted?: boolean;
    last_upload_error?: string | null;
};

export async function listPatientRecords(): Promise<PatientRecord[]> {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await fetch(`${API_URL}/patient/records`, { headers: { Authorization: `Bearer ${token}` } });
    const parsed = await parseApiResponse(response);
    if (!response.ok) throw new Error(parsed.data?.error || 'Could not load records.');
    return (parsed.data?.records || []) as PatientRecord[];
}

export async function deletePatientRecord(recordId: string): Promise<void> {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await fetch(`${API_URL}/patient/records/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = await parseApiResponse(response);
    if (!response.ok) throw new Error(parsed.data?.error || 'Could not delete this record.');
}

export async function uploadPatientRecord(draft: PatientRecordDraft): Promise<void> {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    const form = new FormData();
    form.append('client_upload_id', draft.local_id);
    form.append('title', draft.title.trim());
    form.append('category', draft.category);
    form.append('for_label', draft.for_label.trim());
    form.append('relationship_label', draft.relationship_label.trim());
    form.append('doctor_id', draft.doctor_id ? String(draft.doctor_id) : '');
    form.append('note', draft.note.trim());
    if (draft.latitude !== null && draft.longitude !== null) {
        form.append('latitude', String(draft.latitude));
        form.append('longitude', String(draft.longitude));
        if (draft.location_accuracy_m !== null) form.append('location_accuracy_m', String(draft.location_accuracy_m));
    }
    draft.files.forEach((file) => form.append('files', { uri: file.uri, name: file.name, type: file.type } as any));
    const response = await fetch(`${API_URL}/patient/records`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const parsed = await parseApiResponse(response);
    if (!response.ok) throw new Error(parsed.data?.error || 'Upload failed. Try again when you have a connection.');
}
