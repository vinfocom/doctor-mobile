import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Home } from 'lucide-react-native';
import type { PatientTabParamList } from './types';
import PatientHomeScreen from '../screens/PatientHomeScreen';
import PatientAnnouncementsScreen from '../screens/PatientAnnouncementsScreen';

const Tab = createBottomTabNavigator<PatientTabParamList>();

export default function PatientTabNavigator() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: '#2563eb',
                tabBarInactiveTintColor: 'gray',
                tabBarIcon: ({ color, size }) =>
                    route.name === 'PatientAnnouncements' ? <Bell size={size} color={color} /> : <Home size={size} color={color} />,
            })}
        >
            <Tab.Screen name="PatientHome" component={PatientHomeScreen} options={{ title: "Home" }} />
            <Tab.Screen name="PatientAnnouncements" component={PatientAnnouncementsScreen} options={{ title: "Announcements" }} />
        </Tab.Navigator>
    );
}
