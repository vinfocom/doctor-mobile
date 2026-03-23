import './src/global.css';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { getToken, getRole, type AppRole } from './src/api/token';
import { AuthSessionProvider } from './src/context/AuthSessionContext';
import AppNavigator from './src/navigation';
import type { RootStackParamList } from './src/navigation/types';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import { Alert } from 'react-native';

import type * as NotificationsType from 'expo-notifications';
import Constants from 'expo-constants';

// Alert.alert("ENV CHECK", String(process.env.EXPO_PUBLIC_API_URL));
// Expo Go (SDK 53+) removed remote push notification support.
// Lazy-load expo-notifications so the package never initialises in Expo Go,
// preventing its own startup error from firing.
const isExpoGo = Constants.appOwnership === 'expo';
const Notifications: typeof NotificationsType | null = isExpoGo
  ? null
  : require('expo-notifications');

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRouteName, setInitialRouteName] = useState<keyof RootStackParamList>('Login');
  const [bootRole, setBootRole] = useState<AppRole | null>(null);

  useEffect(() => {
    const bootstrapAsync = async () => {
      let token: string | null = null;
      let role: AppRole | null = null;
      try {
        token = await getToken();
        role = await getRole();
      } catch (e) {
        // Restoring token failed
      }
      if (token && role === 'PATIENT') {
        setInitialRouteName('PatientMain');
      } else if (token && (role === 'DOCTOR' || role === 'CLINIC_STAFF')) {
        setInitialRouteName('DoctorMain');
      } else {
        setInitialRouteName('Login');
      }
      setBootRole(role);
      setIsLoading(false);
    };

    bootstrapAsync();
  }, []);

  useEffect(() => {
    if (!Notifications || !bootRole) return;

    const openFromNotification = (data?: Record<string, unknown>) => {
      if (!data || !navigationRef.isReady()) return;
      if (data.type !== 'chat') return;

      const patientId = Number(data.patientId);
      const doctorId = Number(data.doctorId);
      if (!Number.isFinite(patientId) || !Number.isFinite(doctorId)) return;

      const viewer: 'DOCTOR' | 'PATIENT' = bootRole === 'PATIENT' ? 'PATIENT' : 'DOCTOR';
      const patientName = String(data.senderName || (viewer === 'PATIENT' ? 'Doctor' : 'Patient'));

      navigationRef.navigate('Chat', {
        patientId,
        doctorId,
        patientName,
        viewer,
      });
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        openFromNotification(response?.notification.request.content.data as Record<string, unknown> | undefined);
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(response.notification.request.content.data as Record<string, unknown> | undefined);
    });

    return () => {
      subscription.remove();
    };
  }, [bootRole]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthSessionProvider>
        <NavigationContainer ref={navigationRef}>
          <AppNavigator initialRouteName={initialRouteName} />
        </NavigationContainer>
      </AuthSessionProvider>
    </GestureHandlerRootView>
  );
}
