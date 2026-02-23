import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { MainTabParamList } from './types';
import DashboardScreen from '../screens/DashboardScreen';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import ClinicsScreen from '../screens/ClinicsScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import { Home, Calendar, Stethoscope, Clock, ShieldAlert, Users } from 'lucide-react-native';
import Patients from '../screens/Patients';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { getChatNotifications } from '../api/notifications';

const Tab = createBottomTabNavigator<MainTabParamList>();
const TAB_ORDER: Array<keyof MainTabParamList> = ['Dashboard', 'Appointments', 'Clinics', 'Schedule', 'Patients'];

function withSwipeTabNavigation(
    ScreenComponent: React.ComponentType,
    currentTab: keyof MainTabParamList
) {
    return function SwipeEnabledScreen() {
        const navigation = useNavigation<NavigationProp<MainTabParamList>>();

        const moveToTab = React.useCallback(
            (delta: -1 | 1) => {
                const currentIndex = TAB_ORDER.indexOf(currentTab);
                if (currentIndex < 0) return;
                const nextIndex = currentIndex + delta;
                if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
                navigation.navigate(TAB_ORDER[nextIndex]);
            },
            [navigation]
        );

        const swipeGesture = React.useMemo(
            () =>
                Gesture.Pan()
                    .activeOffsetX([-20, 20])
                    .failOffsetY([-12, 12])
                    .onEnd((event) => {
                        const openNext = event.translationX < -70 || event.velocityX < -700;
                        const openPrev = event.translationX > 70 || event.velocityX > 700;
                        if (openNext) runOnJS(moveToTab)(1);
                        if (openPrev) runOnJS(moveToTab)(-1);
                    }),
            [moveToTab]
        );

        return (
            <GestureDetector gesture={swipeGesture}>
                <View style={{ flex: 1 }}>
                    <ScreenComponent />
                </View>
            </GestureDetector>
        );
    };
}
const DashboardSwipeScreen = withSwipeTabNavigation(DashboardScreen, 'Dashboard');
const AppointmentsSwipeScreen = withSwipeTabNavigation(AppointmentsScreen, 'Appointments');
const ClinicsSwipeScreen = withSwipeTabNavigation(ClinicsScreen, 'Clinics');
const ScheduleSwipeScreen = withSwipeTabNavigation(ScheduleScreen, 'Schedule');
const PatientsSwipeScreen = withSwipeTabNavigation(Patients, 'Patients');

const TabNavigator = () => {
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const lastNotifCheckAtRef = useRef(new Date(Date.now() - 60 * 1000).toISOString());

    useEffect(() => {
        const checkUnread = async () => {
            try {
                const data = await getChatNotifications(lastNotifCheckAtRef.current);
                lastNotifCheckAtRef.current = new Date().toISOString();
                if (data?.count > 0) {
                    setUnreadChatCount((prev) => Math.min(999, prev + data.count));
                }
            } catch {
                // ignore periodic notification errors
            }
        };

        checkUnread();
        const interval = setInterval(checkUnread, 9000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Tab.Navigator
            detachInactiveScreens={false}
            screenOptions={({ route }) => ({
                headerShown: false,
                lazy: false,
                animation: 'shift',
                sceneStyle: { backgroundColor: '#f9fafb' },
                tabBarIcon: ({ color, size }) => {
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
                    } else {
                        IconComponent = ShieldAlert;
                    }

                    return <IconComponent size={size} color={color} />;
                },
                tabBarActiveTintColor: '#007bff',
                tabBarInactiveTintColor: 'gray',
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardSwipeScreen} />
            <Tab.Screen
                name="Appointments"
                component={AppointmentsSwipeScreen}
                options={{
                    tabBarBadge: unreadChatCount > 0 ? (unreadChatCount > 99 ? '99+' : unreadChatCount) : undefined,
                }}
                listeners={{
                    tabPress: () => {
                        setUnreadChatCount(0);
                    },
                }}
            />
            <Tab.Screen name="Clinics" component={ClinicsSwipeScreen} />
            <Tab.Screen name="Schedule" component={ScheduleSwipeScreen} />
            <Tab.Screen name="Patients" component={PatientsSwipeScreen} />
        </Tab.Navigator>
    );
};

export default TabNavigator;
