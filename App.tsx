import './src/global.css';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { getToken, getRole, type AppRole } from './src/api/token';
import { AuthSessionProvider } from './src/context/AuthSessionContext';
import AppNavigator from './src/navigation';
import type { RootStackParamList } from './src/navigation/types';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRouteName, setInitialRouteName] = useState<keyof RootStackParamList>('Login');

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
      setIsLoading(false);
    };

    bootstrapAsync();
  }, []);

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
        <NavigationContainer>
          <AppNavigator initialRouteName={initialRouteName} />
        </NavigationContainer>
      </AuthSessionProvider>
    </GestureHandlerRootView>
  );
}
