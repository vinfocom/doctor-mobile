import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

// Import all screens
import LoginScreen from '../screens/LoginScreen';
import TabNavigator from './TabNavigator';
import ChatScreen from '../screens/ChatScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PatientDetailsScreen from '../screens/PatientDetails';

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
                name="Main"
                component={TabNavigator}
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
                name="PatientDetails"
                component={PatientDetailsScreen}
                options={{ animation: 'slide_from_right' }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;