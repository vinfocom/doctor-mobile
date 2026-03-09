import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, CalendarDays, Home } from 'lucide-react-native';
import type { PatientTabParamList } from './types';
import PatientHomeScreen from '../screens/PatientHomeScreen';
import PatientAnnouncementsScreen from '../screens/PatientAnnouncementsScreen';
import PatientAppointmentsScreen from '../screens/PatientAppointmentsScreen';

const Tab = createBottomTabNavigator<PatientTabParamList>();

export default function PatientTabNavigator() {
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
            <Tab.Screen name="PatientAnnouncements" component={PatientAnnouncementsScreen} options={{ title: "Announcements" }} />
        </Tab.Navigator>
    );
}
