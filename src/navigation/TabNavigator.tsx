import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from './types';
import DashboardScreen from '../screens/DashboardScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import ClinicsScreen from '../screens/ClinicsScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import { Home, Calendar, Stethoscope, Clock, ShieldAlert, Users } from 'lucide-react-native';
import Patients from '../screens/Patients';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TabNavigator = () => {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarIcon: ({ focused, color, size }) => {
                    let IconComponent;

                    if (route.name === 'Dashboard') {
                        IconComponent = Home;
                    } else if (route.name === 'Appointments') {
                        IconComponent = Calendar;
                    } else if (route.name === 'Clinics') {
                        IconComponent = Stethoscope;
                    } else if (route.name === 'Schedule') {
                        IconComponent = Clock;
                    } else if (route.name === 'Patients') {
                        IconComponent = Users;
                    }
                    else {
                        IconComponent = ShieldAlert;
                    }

                    // Simple scale animation could be added here if we wrapped it in Reanimated
                    return <IconComponent size={size} color={color} />;
                },
                tabBarActiveTintColor: '#007bff',
                tabBarInactiveTintColor: 'gray',
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Appointments" component={AppointmentsScreen} />
            <Tab.Screen name="Clinics" component={ClinicsScreen} />
            <Tab.Screen name="Schedule" component={ScheduleScreen} />
            <Tab.Screen name="Patients" component={Patients} />
        </Tab.Navigator>
    );
};

export default TabNavigator;
