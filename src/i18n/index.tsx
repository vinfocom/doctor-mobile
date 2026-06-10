import React from 'react';
import { SUPPORTED_LANGUAGES, translations } from './config';
import { DEFAULT_LANGUAGE, getStoredLanguage, setStoredLanguage } from './storage';
import type { LanguageCode, LanguageOption, TranslationDictionary, TranslationValue } from './types';

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

const LanguageContext = React.createContext<LanguageContextValue | undefined>(undefined);

function getTranslationValue(dictionary: TranslationDictionary, key: string): string | undefined {
    const segments = key.split('.');
    let current: TranslationValue | undefined = dictionary;

    for (const segment of segments) {
        if (!current || typeof current === 'string') {
            return undefined;
        }

        current = current[segment];
    }

    return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, values?: Record<string, string | number>) {
    if (!values) return template;

    return template.replace(/\{\{(.*?)\}\}/g, (_, rawKey: string) => {
        const value = values[rawKey.trim()];
        return value === undefined || value === null ? '' : String(value);
    });
}

function createTranslator(language: LanguageCode) {
    return (key: string, options?: TranslateOptions) => {
        const currentDictionary = translations[language] ?? translations[DEFAULT_LANGUAGE];
        const fallbackDictionary = translations[DEFAULT_LANGUAGE];
        const translated =
            (currentDictionary ? getTranslationValue(currentDictionary, key) : undefined) ??
            (fallbackDictionary ? getTranslationValue(fallbackDictionary, key) : undefined) ??
            options?.fallback ??
            key;

        return interpolate(translated, options?.values);
    };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [currentLanguage, setCurrentLanguage] = React.useState<LanguageCode>(DEFAULT_LANGUAGE);
    const [isReady, setIsReady] = React.useState(false);

    React.useEffect(() => {
        let isMounted = true;

        getStoredLanguage()
            .then((storedLanguage) => {
                if (!isMounted) return;
                setCurrentLanguage(storedLanguage);
            })
            .catch(() => {
                if (!isMounted) return;
                setCurrentLanguage(DEFAULT_LANGUAGE);
            })
            .finally(() => {
                if (!isMounted) return;
                setIsReady(true);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const setLanguage = React.useCallback(async (language: LanguageCode) => {
        setCurrentLanguage(language);

        try {
            await setStoredLanguage(language);
        } catch (error) {
            console.warn('[i18n] Failed to persist selected language', error);
        }
    }, []);

    const t = React.useMemo(() => createTranslator(currentLanguage), [currentLanguage]);

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

export type { LanguageCode, LanguageOption, TranslationDictionary } from './types';
export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from './storage';
export { commonTranslationKeys } from './shared';
