import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

// Import all screens
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import PatientOtpScreen from '../screens/PatientOtpScreen';
import PatientResetPasswordScreen from '../screens/PatientResetPasswordScreen';
import TabNavigator from './TabNavigator';
import PatientTabNavigator from './PatientTabNavigator';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import StaffListScreen from '../screens/StaffListScreen';
import StaffFormScreen from '../screens/StaffFormScreen';
import PatientDetailsScreen from '../screens/PatientDetails';
import DoctorAnnouncementsScreen from '../screens/DoctorAnnouncementsScreen';
import PatientProfileScreen from '../screens/PatientProfileScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = ({ initialRouteName }: { initialRouteName: keyof RootStackParamList }) => {
    return (
        <Stack.Navigator
            initialRouteName={initialRouteName}
            screenOptions={{
                headerShown: false, // Hide default headers globally
                animation: 'slide_from_right', // Smooth native slide transition
                gestureEnabled: true,
                gestureDirection: 'horizontal',
            }}
        >
            {/* Fade animations for Auth -> Dashboard flow */}
            <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{ animation: 'fade' }}
            />

            <Stack.Screen
                name="Signup"
                component={SignupScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="PatientOtp"
                component={PatientOtpScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="PatientResetPassword"
                component={PatientResetPasswordScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="DoctorMain"
                component={TabNavigator}
                options={{ animation: 'fade' }}
            />

            <Stack.Screen
                name="PatientMain"
                component={PatientTabNavigator}
                options={{ animation: 'fade' }}
            />

            <Stack.Screen
                name="Chat"
                component={ChatScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="StaffList"
                component={StaffListScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="StaffForm"
                component={StaffFormScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="DoctorAnnouncements"
                component={DoctorAnnouncementsScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="PatientDetails"
                component={PatientDetailsScreen}
                options={{ animation: 'slide_from_right' }}
            />

            <Stack.Screen
                name="PatientProfile"
                component={PatientProfileScreen}
                options={{ animation: 'slide_from_right' }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;
