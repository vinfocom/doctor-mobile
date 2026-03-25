import React from 'react';
import { getMe, type AuthMeUser } from '../api/auth';
import { getRole, getToken, removeToken, type AppRole } from '../api/token';
import { updateProfile, updatePatientProfile } from '../api/auth';
import { registerForPushNotificationsAsync } from '../hooks/usePushNotifications';

type SessionState = {
    role: AppRole | null;
    staff_role: string | null;
    staff_clinic_id: number | null;
    staff_doctor_id: number | null;
    name: string | null;
    email: string | null;
    user: AuthMeUser | null;
    isLoading: boolean;
    refreshSession: () => Promise<void>;
    clearSession: () => void;
};

const AuthSessionContext = React.createContext<SessionState | undefined>(undefined);

function mapUserToSession(user: AuthMeUser | null): Omit<SessionState, 'isLoading' | 'refreshSession' | 'clearSession'> {
    return {
        role: user?.role ?? null,
        staff_role: user?.staff_role ?? null,
        staff_clinic_id: user?.staff_clinic_id ?? null,
        staff_doctor_id: user?.staff_doctor_id ?? null,
        name: user?.name ?? null,
        email: user?.email ?? null,
        user,
    };
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = React.useState<Omit<SessionState, 'isLoading' | 'refreshSession' | 'clearSession'>>({
        role: null,
        staff_role: null,
        staff_clinic_id: null,
        staff_doctor_id: null,
        name: null,
        email: null,
        user: null,
    });
    const [isLoading, setIsLoading] = React.useState(true);

    const clearSession = React.useCallback(() => {
        setSession({
            role: null,
            staff_role: null,
            staff_clinic_id: null,
            staff_doctor_id: null,
            name: null,
            email: null,
            user: null,
        });
    }, []);

    const refreshSession = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const token = await getToken();
            const storedRole = await getRole();

            if (!token || !storedRole) {
                clearSession();
                return;
            }

            if (storedRole === 'PATIENT') {
                setSession({
                    role: storedRole,
                    staff_role: null,
                    staff_clinic_id: null,
                    staff_doctor_id: null,
                    name: null,
                    email: null,
                    user: null,
                });
                registerForPushNotificationsAsync().then(token => {
                    if (token?.data) {
                        console.log('[push] saving patient push token to backend:', token.data);
                        updatePatientProfile({ push_token: token.data })
                            .then(() => console.log('[push] patient push token saved successfully'))
                            .catch((error) => console.log('[push] failed to save patient push token:', error));
                    } else {
                        console.log('[push] patient push token missing, nothing to save');
                    }
                }).catch((error) => console.log('[push] patient token registration failed:', error));
                return;
            }

            const response = await getMe();
            setSession(mapUserToSession(response.user));
            if (response.user.role === 'DOCTOR') {
                registerForPushNotificationsAsync().then(token => {
                    if (token?.data) {
                        console.log('[push] saving doctor push token to backend:', token.data);
                        updateProfile({ push_token: token.data })
                            .then(() => console.log('[push] doctor push token saved successfully'))
                            .catch((error) => console.log('[push] failed to save doctor push token:', error));
                    } else {
                        console.log('[push] doctor push token missing, nothing to save');
                    }
                }).catch((error) => console.log('[push] doctor token registration failed:', error));
            }
        } catch {
            await removeToken();
            clearSession();
        } finally {
            setIsLoading(false);
        }
    }, [clearSession]);

    React.useEffect(() => {
        refreshSession().catch(() => {
            clearSession();
            setIsLoading(false);
        });
    }, [clearSession, refreshSession]);

    const value = React.useMemo(
        () => ({
            ...session,
            isLoading,
            refreshSession,
            clearSession,
        }),
        [clearSession, isLoading, refreshSession, session]
    );

    return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
    const context = React.useContext(AuthSessionContext);
    if (!context) {
        throw new Error('useAuthSession must be used within an AuthSessionProvider');
    }
    return context;
}
