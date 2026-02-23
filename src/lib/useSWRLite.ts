import { useCallback, useEffect, useRef, useState } from 'react';

type CacheEntry<T> = {
    data?: T;
    ts: number;
};

const CACHE = new Map<string, CacheEntry<unknown>>();

interface Options {
    revalidateOnMount?: boolean;
}

export function useSWRLite<T>(key: string, fetcher: () => Promise<T>, options: Options = {}) {
    const cached = CACHE.get(key) as CacheEntry<T> | undefined;
    const [data, setData] = useState<T | undefined>(cached?.data);
    const [isLoading, setIsLoading] = useState(!cached?.data);
    const [error, setError] = useState<unknown>(null);
    const dataRef = useRef<T | undefined>(cached?.data);

    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    const revalidate = useCallback(async () => {
        if (!dataRef.current) setIsLoading(true);
        setError(null);
        try {
            const next = await fetcher();
            CACHE.set(key, { data: next, ts: Date.now() });
            setData(next);
            return next;
        } catch (e) {
            setError(e);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, [key, fetcher]);

    useEffect(() => {
        if (options.revalidateOnMount === false) return;
        revalidate().catch(() => {
            // no-op, state is handled above
        });
    }, [revalidate, options.revalidateOnMount]);

    return { data, isLoading, error, revalidate };
}
