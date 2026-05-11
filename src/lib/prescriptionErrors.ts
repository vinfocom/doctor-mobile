export const getPrescriptionErrorMessage = (
    error: unknown,
    fallbackMessage: string
) => {
    const candidate = error as {
        response?: { status?: number; data?: { error?: string; detail?: string } };
        message?: string;
    };

    const status = candidate?.response?.status;
    const apiMessage = candidate?.response?.data?.error || candidate?.response?.data?.detail;
    const rawMessage = String(apiMessage || candidate?.message || '').trim();
    const normalized = rawMessage.toLowerCase();

    if (status === 401 || normalized.includes('unauthorized')) {
        return 'Your session has expired. Please sign in again and retry.';
    }

    if (status === 403) {
        if (normalized.includes('doctor context')) {
            return 'This prescription can only be accessed inside the selected doctor context.';
        }
        if (normalized.includes('linked to this doctor') || normalized.includes('not linked')) {
            return 'This patient is not linked to the selected doctor, so the prescription cannot be opened here.';
        }
        return 'You do not have permission to access this prescription.';
    }

    if (normalized.includes('network request failed') || normalized.includes('failed to fetch')) {
        return 'Network error while uploading or loading prescriptions. Please check your internet connection and retry.';
    }

    if (normalized.includes('invalid file type')) {
        return 'Unsupported format. Please upload JPG, PNG, WEBP, HEIC, or HEIF images only.';
    }

    if (normalized.includes('file too large')) {
        return rawMessage || 'Image is too large. Please choose a smaller image and retry.';
    }

    if (normalized.includes('too many prescription pages')) {
        return rawMessage || 'Too many pages selected. Reduce the page count and retry.';
    }

    if (normalized.includes('at least one prescription image is required')) {
        return 'Please add at least one prescription image before uploading.';
    }

    if (normalized.includes('compression') || normalized.includes('manipulate')) {
        return 'Image preparation failed before upload. Please pick the images again and retry.';
    }

    if (normalized.includes('upload cancelled') || normalized.includes('canceled')) {
        return 'Prescription upload was cancelled.';
    }

    if (normalized.includes('doctor context is missing')) {
        return 'Doctor context is missing. Open the prescription flow from the correct doctor and retry.';
    }

    if (normalized.includes('missing prescription upload context')) {
        return 'Prescription context is missing. Please reopen this patient in the correct doctor context and retry.';
    }

    return rawMessage || fallbackMessage;
};
