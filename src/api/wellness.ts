import { API_URL } from '../config/env';
import { getToken } from './token';
import { parseApiResponse } from './responseParsing';

export type WellnessTestResult = {
    result_id: string | number;
    test_type: string;
    completed_at: string;
    method_version: string | null;
    result_value: number | string | null;
    result_unit: string | null;
    result_summary: string;
    result_details?: Record<string, unknown> | null;
};
export type WellnessTestPage = { results: WellnessTestResult[]; hasMore: boolean; nextCursor: string | null };

async function request(path: string, init: RequestInit = {}) {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await fetch(`${API_URL}/patient/wellness${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    const parsed = await parseApiResponse(response);
    if (!response.ok) {
        const message = parsed.data?.error || 'Could not load Wellness data.';
        throw new Error(`${message} (HTTP ${response.status})`);
    }
    return parsed.data;
}

export async function listWellnessTests(cursor?: string | null): Promise<WellnessTestPage> {
    const params = new URLSearchParams({ view: 'tests', take: '50' });
    if (cursor) params.set('cursor', cursor);
    const data = await request(`?${params.toString()}`);
    return { results: (data?.results || []) as WellnessTestResult[], hasMore: Boolean(data?.hasMore), nextCursor: data?.nextCursor ? String(data.nextCursor) : null };
}

export type WellnessCompletion = {
    completion_id: string | number;
    activity_type: 'GAME' | 'QUIZ' | 'RELAX';
    activity_id: string;
    completed_at: string;
    completion_date_local: string;
    timezone: string;
};

export async function listWellnessProgress(): Promise<{ completions: WellnessCompletion[]; active_dates: string[] }> {
    const data = await request('?view=completions');
    return {
        completions: (data?.completions || []) as WellnessCompletion[],
        active_dates: (data?.active_dates || []) as string[],
    };
}

export async function saveWellnessCompletion(activityType: 'GAME' | 'QUIZ' | 'RELAX', activityId: string): Promise<{ saved: boolean; completion_date_local: string; timezone: string }> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return await request('', { method: 'POST', body: JSON.stringify({ kind: 'completion', activity_type: activityType, activity_id: activityId, timezone }) }) as { saved: boolean; completion_date_local: string; timezone: string };
}

export async function saveWellnessExposure(contentType: 'GAME' | 'QUIZ' | 'COLOR_VISION', contentId: string) {
    return request('', { method: 'POST', body: JSON.stringify({ kind: 'exposure', content_type: contentType, content_id: contentId }) });
}

export async function listRecentWellnessExposures(): Promise<{ games: string[]; quizzes: string[]; colorVision: string[] }> {
    const data = await request('?view=exposures');
    const rows = (data?.exposures || []) as Array<{ content_type: 'GAME' | 'QUIZ' | 'COLOR_VISION'; content_id: string }>;
    return {
        games: rows.filter((item) => item.content_type === 'GAME').map((item) => item.content_id),
        quizzes: rows.filter((item) => item.content_type === 'QUIZ').map((item) => item.content_id),
        colorVision: rows.filter((item) => item.content_type === 'COLOR_VISION').map((item) => item.content_id),
    };
}

export async function saveWellnessTestResult(input: Omit<WellnessTestResult, 'result_id' | 'completed_at'>): Promise<{ saved: boolean; result_id: string }> {
    return await request('', { method: 'POST', body: JSON.stringify({ kind: 'test', ...input }) }) as { saved: boolean; result_id: string };
}
