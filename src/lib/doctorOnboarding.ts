type ClinicWithSchedules = {
    schedules?: unknown[] | null;
};

type DoctorProfileResponse = {
    doctor?: {
        clinics?: ClinicWithSchedules[] | null;
    } | null;
};

export function doctorNeedsSetup(profile: DoctorProfileResponse | null | undefined) {
    const clinics = profile?.doctor?.clinics || [];
    if (clinics.length === 0) return true;

    return !clinics.some((clinic) => Array.isArray(clinic.schedules) && clinic.schedules.length > 0);
}
