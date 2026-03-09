import client from './client';
import { getAppointments } from './appointments';
import { sendChatMessage } from './chat';

export type AnnouncementTargetMode = 'TOMORROW' | 'TODAY' | 'CUSTOM';
export interface AnnouncementCampaign {
    campaign_id: number;
    created_at: string;
    content: string;
    asAnnouncement: boolean;
    recipientCount: number;
}

export const getAnnouncementTargets = async (
    targetMode: AnnouncementTargetMode = 'TODAY',
    targetDate?: string
) => {
    const query = new URLSearchParams({
        mode: 'targets',
        targetMode,
    });
    if (targetMode === 'CUSTOM' && targetDate) {
        query.set('targetDate', targetDate);
    }
    const response = await client.get(`/announcements?${query.toString()}`);
    return response.data as {
        count: number;
        patients: Array<{
            patient_id: number;
            name: string;
            appointment_date: string;
            start_time: string;
        }>;
    };
};

export const getPatientAnnouncements = async (limit: number = 30) => {
    const response = await client.get(`/announcements?mode=received&limit=${encodeURIComponent(limit)}`);
    return response.data as {
        announcements: Array<{
            message_id: number;
            doctor_id: number;
            doctor_name: string;
            content: string;
            created_at: string;
        }>;
    };
};

export const getAnnouncementHistory = async (limit: number = 200) => {
    const response = await client.get(`/announcements?mode=history&limit=${encodeURIComponent(limit)}`);
    return response.data as {
        campaigns: AnnouncementCampaign[];
    };
};

export const resendAnnouncementCampaign = async (
    campaignId: number,
    options?: { message?: string; asAnnouncement?: boolean }
) => {
    const response = await client.post('/announcements', {
        action: 'resend',
        campaignId,
        message: options?.message,
        asAnnouncement: options?.asAnnouncement,
    });
    return response.data as {
        success: boolean;
        sent: number;
        asAnnouncement: boolean;
        resentFromCampaignId: number;
    };
};

export const sendAnnouncement = async (
    message: string,
    asAnnouncement: boolean = true,
    targetMode: AnnouncementTargetMode = 'TODAY',
    targetDate?: string
) => {
    try {
        const response = await client.post('/announcements', { message, asAnnouncement, targetMode, targetDate });
        return response.data;
    } catch (error: any) {
        const status = error?.response?.status;
        // Fallback for deployments where /announcements route is not yet available.
        const shouldFallback =
            status === 404 ||
            status === 405 ||
            status >= 500 ||
            !error?.response;
        if (!shouldFallback) throw error;

        const appointments = await getAppointments();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextDay = new Date(today);
        nextDay.setDate(today.getDate() + 1);

        const customStart = targetMode === 'CUSTOM' && targetDate ? new Date(`${targetDate}T00:00:00`) : null;
        const customEnd = customStart ? new Date(customStart) : null;
        if (customEnd) customEnd.setDate(customStart!.getDate() + 1);

        const unique = new Map<number, { patient_id: number; doctor_id: number }>();
        for (const a of appointments || []) {
            if (a?.status !== 'BOOKED') continue;
            if (!a?.patient_id || !a?.doctor_id) continue;
            const date = a?.appointment_date ? new Date(a.appointment_date) : null;
            if (!date || Number.isNaN(date.getTime())) continue;
            if (targetMode === 'TODAY') {
                if (!(date >= today && date < nextDay)) continue;
            } else if (targetMode === 'CUSTOM') {
                if (!customStart || Number.isNaN(customStart.getTime()) || !customEnd || !(date >= customStart && date < customEnd)) continue;
            } else {
                if (date < today) continue;
            }
            if (!unique.has(a.patient_id)) {
                unique.set(a.patient_id, { patient_id: a.patient_id, doctor_id: a.doctor_id });
            }
        }

        const targets = Array.from(unique.values());
        await Promise.allSettled(
            targets.map((t) =>
                sendChatMessage({
                    patient_id: t.patient_id,
                    doctor_id: t.doctor_id,
                    sender: 'DOCTOR',
                    content: asAnnouncement ? `Announcement: ${message}` : message,
                })
            )
        );

        return { success: true, sent: targets.length, fallback: true, asAnnouncement };
    }
};
