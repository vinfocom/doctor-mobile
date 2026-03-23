let patientAnnouncementsReadAt = 0;
let doctorChatsReadAt = 0;
const doctorReadPatientIds = new Set<number>();
const patientReadDoctorIds = new Set<number>();
const patientDoctorChatReadAt = new Map<number, number>();

export function markPatientAnnouncementsRead() {
    patientAnnouncementsReadAt = Date.now();
}

export function getPatientAnnouncementsReadAt() {
    return patientAnnouncementsReadAt;
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
