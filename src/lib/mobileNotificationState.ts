let patientAnnouncementsReadAt = 0;
let doctorChatsReadAt = 0;
const doctorReadPatientIds = new Set<number>();

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
