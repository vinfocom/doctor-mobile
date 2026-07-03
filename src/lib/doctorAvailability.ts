type DoctorAvailabilityCandidate = {
    status?: string | null;
    active_from?: string | null;
    active_to?: string | null;
    activeFrom?: string | null;
    activeTo?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
};

const toIndiaYmd = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const getTodayIndiaYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const readFirstDate = (values: Array<unknown>) => {
    for (const value of values) {
        const normalized = toIndiaYmd(value);
        if (normalized) return normalized;
    }
    return '';
};

export const isDoctorBookableForPatient = (
    doctor?: DoctorAvailabilityCandidate | null,
    todayYmd = getTodayIndiaYmd()
) => {
    if (!doctor) return false;
    if (String(doctor.status || '').toUpperCase() === 'INACTIVE') return false;

    const activeFrom = readFirstDate([
        doctor.active_from,
        doctor.activeFrom,
        doctor.valid_from,
        doctor.validFrom,
    ]);
    const activeTo = readFirstDate([
        doctor.active_to,
        doctor.activeTo,
        doctor.valid_to,
        doctor.validTo,
    ]);

    if (activeFrom && todayYmd < activeFrom) return false;
    if (activeTo && todayYmd > activeTo) return false;
    return true;
};
