import * as SecureStore from 'expo-secure-store';

const PATIENT_ANNOUNCEMENTS_READ_AT_KEY = 'patientAnnouncementsReadAt';

let patientAnnouncementsReadAt = 0;
let patientAnnouncementsUnreadCount = 0;
let doctorChatsReadAt = 0;
const doctorReadPatientIds = new Set<number>();
const patientReadDoctorIds = new Set<number>();
const patientDoctorChatReadAt = new Map<number, number>();
const patientAnnouncementListeners = new Set<() => void>();
let patientAnnouncementsHydrated = false;
let patientAnnouncementsHydrationPromise: Promise<void> | null = null;

const emitPatientAnnouncementChange = () => {
    patientAnnouncementListeners.forEach((listener) => {
        try {
            listener();
        } catch {
            // ignore listener errors
        }
    });
};

export function ensurePatientAnnouncementsStateHydrated() {
    if (patientAnnouncementsHydrated) {
        return Promise.resolve();
    }
    if (!patientAnnouncementsHydrationPromise) {
        patientAnnouncementsHydrationPromise = SecureStore.getItemAsync(PATIENT_ANNOUNCEMENTS_READ_AT_KEY)
            .then((storedReadAt) => {
                const parsed = storedReadAt ? Number(storedReadAt) : 0;
                patientAnnouncementsReadAt = Number.isFinite(parsed) ? parsed : 0;
                patientAnnouncementsHydrated = true;
                emitPatientAnnouncementChange();
            })
            .catch(() => {
                patientAnnouncementsHydrated = true;
            })
            .finally(() => {
                patientAnnouncementsHydrationPromise = null;
            });
    }
    return patientAnnouncementsHydrationPromise;
}

export function markPatientAnnouncementsRead() {
    patientAnnouncementsReadAt = Date.now();
    patientAnnouncementsUnreadCount = 0;
    emitPatientAnnouncementChange();
    void SecureStore.setItemAsync(PATIENT_ANNOUNCEMENTS_READ_AT_KEY, String(patientAnnouncementsReadAt)).catch(() => undefined);
}

export function getPatientAnnouncementsReadAt() {
    return patientAnnouncementsReadAt;
}

export function getPatientAnnouncementsUnreadCount() {
    return patientAnnouncementsUnreadCount;
}

export function setPatientAnnouncementsUnreadCount(count: number) {
    const nextCount = Math.max(0, count);
    if (patientAnnouncementsUnreadCount === nextCount) return;
    patientAnnouncementsUnreadCount = nextCount;
    emitPatientAnnouncementChange();
}

export function incrementPatientAnnouncementsUnread(amount: number = 1) {
    if (amount <= 0) return;
    patientAnnouncementsUnreadCount += amount;
    emitPatientAnnouncementChange();
}

export function subscribePatientAnnouncementsState(listener: () => void) {
    patientAnnouncementListeners.add(listener);
    return () => {
        patientAnnouncementListeners.delete(listener);
    };
}

export function markDoctorPatientChatRead(patientId: number) {
    doctorChatsReadAt = Date.now();
    doctorReadPatientIds.add(patientId);
}

export function getDoctorChatsReadAt() {
    return doctorChatsReadAt;
}

export function consumeDoctorReadPatientIds() {
    const ids = Array.from(doctorReadPatientIds);
    doctorReadPatientIds.clear();
    return ids;
}

export function markPatientDoctorChatRead(doctorId: number) {
    const readAt = Date.now();
    patientReadDoctorIds.add(doctorId);
    patientDoctorChatReadAt.set(doctorId, readAt);
}

export function consumePatientReadDoctorChatEvents() {
    const events = Array.from(patientReadDoctorIds).map((doctorId) => ({
        doctorId,
        readAt: patientDoctorChatReadAt.get(doctorId) || 0,
    }));
    patientReadDoctorIds.clear();
    return events;
}
