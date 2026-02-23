import client from './client';

export interface IncomingNotificationMessage {
    senderName: string;
    senderRole: 'DOCTOR' | 'PATIENT';
    preview: string;
    isAnnouncement?: boolean;
    createdAt: string;
    patientId: number;
    doctorId: number;
}

export interface ChatNotificationsResponse {
    count: number;
    announcementCount: number;
    latestAt: string | null;
    latestMessage?: IncomingNotificationMessage | null;
}

export const getChatNotifications = async (since: string): Promise<ChatNotificationsResponse> => {
    const response = await client.get(`/chat/notifications?since=${encodeURIComponent(since)}`);
    return response.data;
};
