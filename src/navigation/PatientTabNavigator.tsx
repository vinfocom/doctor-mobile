import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, CalendarDays, Home } from 'lucide-react-native';
import type { PatientTabParamList } from './types';
import PatientHomeScreen from '../screens/PatientHomeScreen';
import PatientAnnouncementsScreen from '../screens/PatientAnnouncementsScreen';
import PatientAppointmentsScreen from '../screens/PatientAppointmentsScreen';
import { getPatientAnnouncements } from '../api/announcements';
import {
    ensurePatientAnnouncementsStateHydrated,
    getPatientAnnouncementsReadAt,
    getPatientAnnouncementsUnreadCount,
    setPatientAnnouncementsUnreadCount,
    subscribePatientAnnouncementsState,
} from '../lib/mobileNotificationState';

const Tab = createBottomTabNavigator<PatientTabParamList>();

export default function PatientTabNavigator() {
    const [announcementBadgeCount, setAnnouncementBadgeCount] = useState(getPatientAnnouncementsUnreadCount());

    useEffect(() => {
        const unsubscribe = subscribePatientAnnouncementsState(() => {
            setAnnouncementBadgeCount(getPatientAnnouncementsUnreadCount());
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        let mounted = true;

        const syncAnnouncementBadge = async () => {
            try {
                await ensurePatientAnnouncementsStateHydrated();
                const data = await getPatientAnnouncements(50);
                const readAt = getPatientAnnouncementsReadAt();
                const unreadCount = (data?.announcements || []).filter((item) => {
                    const createdAt = new Date(item.created_at).getTime();
                    return Number.isFinite(createdAt) && createdAt > readAt;
                }).length;
                if (mounted) {
                    setPatientAnnouncementsUnreadCount(unreadCount);
                }
            } catch {
                // ignore badge sync errors
            }
        };

        syncAnnouncementBadge();
        const interval = setInterval(syncAnnouncementBadge, 7000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: '#2563eb',
                tabBarInactiveTintColor: 'gray',
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'PatientAnnouncements') return <Bell size={size} color={color} />;
                    if (route.name === 'PatientAppointments') return <CalendarDays size={size} color={color} />;
                    return <Home size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="PatientHome" component={PatientHomeScreen} options={{ title: "Home" }} />
            <Tab.Screen name="PatientAppointments" component={PatientAppointmentsScreen} options={{ title: "Appointments" }} />
            <Tab.Screen
                name="PatientAnnouncements"
                component={PatientAnnouncementsScreen}
                options={{
                    title: "Announcements",
                    tabBarBadge: announcementBadgeCount > 0 ? (announcementBadgeCount > 99 ? '99+' : announcementBadgeCount) : undefined,
                }}
            />
        </Tab.Navigator>
    );
}
