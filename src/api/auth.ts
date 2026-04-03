import type { AxiosRequestConfig } from 'axios';
import client from './client';
import type { AppRole } from './token';

export interface AuthMeUser {
    user_id: number;
    email: string | null;
    name: string | null;
    role: AppRole;
    created_at?: string | null;
    staff_role: string | null;
    staff_clinic_id: number | null;
    staff_doctor_id: number | null;
}

export interface LoginChallenge {
    challengeId: string;
    question: string;
    expiresAt: string;
}

export const getLoginChallenge = async (): Promise<LoginChallenge> => {
    const response = await client.get('/auth/login-challenge');
    return response.data;
};

export const verifyLoginChallenge = async (challengeId: string, answer: string) => {
    const response = await client.post('/auth/login-challenge', { challengeId, answer });
    return response.data;
};

export const login = async (
    email: string,
    password: string,
    challengeId: string,
    challengeVerificationToken: string
) => {
    const response = await client.post('/auth/login', {
        email,
        password,
        challengeId,
        challengeVerificationToken,
    });
    return response.data;
};

export const getMe = async (): Promise<{ user: AuthMeUser }> => {
    const response = await client.get('/auth/me');
    return response.data;
};

export const getProfile = async () => {
    const response = await client.get('/doctors/me');
    return response.data;
};


export const updateProfile = async (data: {
    doctor_name?: string;
    phone?: string;
    specialization?: string;
    chat_id?: string;
    telegram_userid?: string;
    education?: string;
    address?: string;
    registration_no?: string;
    gst_number?: string;
    pan_number?: string;
    profile_pic_url?: string;
    document_url?: string;
    whatsapp_numbers?: { whatsapp_number: string; is_primary: boolean }[];
    push_token?: string;
}, authToken?: string) => {
    const config: AxiosRequestConfig | undefined = authToken
        ? {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        }
        : undefined;
    const response = await client.patch('/doctors/me', data, config);
    return response.data;
};

export const patientLogin = async (
    identifier: string,
    challengeId: string,
    challengeVerificationToken: string
) => {
    const response = await client.post('/patient-auth/login', {
        identifier,
        challengeId,
        challengeVerificationToken,
    });
    return response.data;
};

export const getPatientProfile = async () => {
    const response = await client.get('/patient/me');
    return response.data;
};

export const updatePatientProfile = async (data: {
    full_name?: string;
    phone?: string;
    age?: number | string;
    gender?: string;
    push_token?: string;
}, authToken?: string) => {
    const config: AxiosRequestConfig | undefined = authToken
        ? {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        }
        : undefined;
    const response = await client.patch('/patient/me', data, config);
    return response.data;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorDetails(error: unknown) {
    const maybeError = error as {
        response?: {
            status?: number;
            data?: unknown;
        };
        message?: string;
    };

    return {
        status: maybeError?.response?.status ?? null,
        data: maybeError?.response?.data ?? null,
        message: maybeError?.message ?? 'unknown error',
    };
}

function logPushFailure(role: 'DOCTOR' | 'PATIENT', message: string, details?: unknown) {
    console.warn(`[push] ${role.toLowerCase()} ${message}`, details ?? '');
}

async function savePushTokenWithRetry(
    role: 'DOCTOR' | 'PATIENT',
    pushToken: string,
    authToken?: string
) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            if (__DEV__) {
                console.log(`[push] ${role.toLowerCase()} push token save attempt ${attempt}/${maxAttempts}`);
            }

            if (role === 'PATIENT') {
                await updatePatientProfile({ push_token: pushToken }, authToken);
            } else {
                await updateProfile({ push_token: pushToken }, authToken);
            }

            if (__DEV__) {
                console.log(`[push] ${role.toLowerCase()} push token saved successfully`);
            }
            return;
        } catch (error) {
            const details = getErrorDetails(error);
            if (__DEV__) {
                console.log(`[push] ${role.toLowerCase()} push token save attempt ${attempt} failed`, details);
            }
            logPushFailure(role, `push token save attempt ${attempt} failed`, details);

            if (attempt === maxAttempts) {
                throw error;
            }

            await sleep(attempt * 750);
        }
    }
}

export const saveDoctorPushToken = async (pushToken: string, authToken?: string) => {
    await savePushTokenWithRetry('DOCTOR', pushToken, authToken);
};

export const savePatientPushToken = async (pushToken: string, authToken?: string) => {
    await savePushTokenWithRetry('PATIENT', pushToken, authToken);
};
