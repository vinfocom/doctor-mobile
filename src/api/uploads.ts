import { API_URL } from '../config/env';
import { getToken } from './token';

type UploadKind = 'profile_pic' | 'document';
type UploadedFileResponse = {
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
};

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

    return data as UploadedFileResponse;
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

export async function uploadDoctorSignupDocument(params: {
    uri: string;
    name: string;
    mimeType: string;
    challengeId: string;
    challengeVerificationToken: string;
}) {
    const formData = new FormData();
    formData.append('challengeId', params.challengeId);
    formData.append('challengeVerificationToken', params.challengeVerificationToken);
    formData.append('uploadType', 'document');
    formData.append('file', {
        uri: params.uri,
        name: params.name,
        type: params.mimeType,
    } as any);

    const response = await fetch(`${API_URL}/doctor-auth/upload`, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error || 'Upload failed');
    }

    return data as UploadedFileResponse;
}

export async function uploadDoctorSignupProfilePicture(params: {
    uri: string;
    name: string;
    mimeType: string;
    challengeId: string;
    challengeVerificationToken: string;
}) {
    const formData = new FormData();
    formData.append('challengeId', params.challengeId);
    formData.append('challengeVerificationToken', params.challengeVerificationToken);
    formData.append('uploadType', 'profile_pic');
    formData.append('file', {
        uri: params.uri,
        name: params.name,
        type: params.mimeType,
    } as any);

    const response = await fetch(`${API_URL}/doctor-auth/upload`, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error || 'Upload failed');
    }

    return data as UploadedFileResponse;
}
