import React from 'react';

export const DEFAULT_LANGUAGE = 'en' as const;
export const LANGUAGE_STORAGE_KEY = 'app_language';

export type LanguageCode = typeof DEFAULT_LANGUAGE;
export type LanguageOption = {
    code: LanguageCode;
    label: string;
};

export interface TranslationDictionary {
    [key: string]: string | TranslationDictionary;
}

type TranslateOptions = {
    fallback?: string;
    values?: Record<string, string | number>;
};

type LanguageContextValue = {
    currentLanguage: LanguageCode;
    setLanguage: (language: LanguageCode) => Promise<void>;
    t: (key: string, options?: TranslateOptions) => string;
    isReady: boolean;
    supportedLanguages: readonly LanguageOption[];
};

const SUPPORTED_LANGUAGES = [{ code: DEFAULT_LANGUAGE, label: 'English' }] as const;
const commonTranslationKeys: readonly string[] = [];

const LanguageContext = React.createContext<LanguageContextValue | undefined>(undefined);

function interpolate(template: string, values?: Record<string, string | number>) {
    if (!values) return template;

    return template.replace(/\{\{(.*?)\}\}/g, (_, rawKey: string) => {
        const value = values[rawKey.trim()];
        return value === undefined || value === null ? '' : String(value);
    });
}

function createTranslator() {
    return (key: string, options?: TranslateOptions) => interpolate(options?.fallback ?? key, options?.values);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [currentLanguage, setCurrentLanguage] = React.useState<LanguageCode>(DEFAULT_LANGUAGE);
    const [isReady] = React.useState(true);

    const setLanguage = React.useCallback(async (language: LanguageCode) => {
        setCurrentLanguage(language);
    }, []);

    const t = React.useMemo(() => createTranslator(), []);

    const value = React.useMemo(
        () => ({
            currentLanguage,
            setLanguage,
            t,
            isReady,
            supportedLanguages: SUPPORTED_LANGUAGES,
        }),
        [currentLanguage, isReady, setLanguage, t]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
    const context = React.useContext(LanguageContext);

    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }

    return context;
}

export { commonTranslationKeys };
