export const parseApiResponse = async (response: Response) => {
    const responseText = await response.text();
    let data: any = null;

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            data = null;
        }
    }

    return {
        data,
        responseText,
    };
};

export const getApiErrorFromResponse = (
    response: Response,
    parsed: { data: any; responseText: string },
    fallbackMessage: string
) => {
    const fromJson =
        parsed.data?.detail ||
        parsed.data?.error ||
        parsed.data?.message;

    if (typeof fromJson === 'string' && fromJson.trim()) {
        return fromJson;
    }

    if (response.status === 413) {
        return 'Selected image is too large. Please try again with a smaller image.';
    }

    if (parsed.responseText.trim().startsWith('<')) {
        return fallbackMessage;
    }

    return fallbackMessage;
};
