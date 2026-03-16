import { API_URL } from '../config/env';
import { getToken } from './token';

type UploadKind = 'profile_pic' | 'document';

export async function uploadDoctorFile(params: {
    uri: string;
    name: string;
    mimeType: string;
    type: UploadKind;
}) {
    const token = await getToken();
    if (!token) {
        throw new Error('Missing auth token');
    }

    const formData = new FormData();
    formData.append('type', params.type);
    formData.append('file', {
        uri: params.uri,
        name: params.name,
        type: params.mimeType,
    } as any);

    const response = await fetch(`${API_URL}/doctors/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error || 'Upload failed');
    }

    return data as { url: string };
}

export async function uploadClinicBarcode(params: { uri: string; name: string; mimeType: string }) {
    const token = await getToken();
    if (!token) {
        throw new Error('Missing auth token');
    }

    const formData = new FormData();
    formData.append('file', {
        uri: params.uri,
        name: params.name,
        type: params.mimeType,
    } as any);

    const response = await fetch(`${API_URL}/clinics/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error || 'Upload failed');
    }

    return data as { url: string };
}
