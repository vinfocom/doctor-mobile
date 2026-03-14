import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    RefreshControl,
    Image,
} from 'react-native';
import {
    User,
    Phone,
    Stethoscope,
    FileText,
    MessageCircle,
    LogOut,
    PhoneOff,
    Award,
    Hash,
    Briefcase,
    Clock,
    CalendarCheck2,
    ArrowRight,
    CheckCircle2,
    CalendarClock,
    UserX,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getProfile } from '../api/auth';
import { getAppointments } from '../api/appointments';
import { removeToken } from '../api/token';
import { getChatNotifications } from '../api/notifications';
import { useSWRLite } from '../lib/useSWRLite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type DashboardScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DoctorMain'>;

const InfoCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <View
        className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start"
        style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
        }}
    >
        <View className="mr-3 mt-0.5">{icon}</View>
        <View className="flex-1">
            <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">{label}</Text>
            <Text className="text-base text-gray-800 font-medium">{value}</Text>
        </View>
    </View>
);

const QuickActionButton = ({
    icon,
    label,
    onPress,
    color,
}: {
    icon: string;
    label: string;
    onPress: () => void;
    color: string;
}) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-1 items-center rounded-2xl py-4 mx-1"
        style={{
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 4,
        }}
    >
        <Text style={{ fontSize: 22 }} className="mb-1">{icon}</Text>
        <Text className="text-white font-bold text-xs text-center">{label}</Text>
    </TouchableOpacity>
);

const DashboardScreen = () => {
    const navigation = useNavigation<DashboardScreenNavigationProp>();
    const [refreshing, setRefreshing] = useState(false);
    const [notifCount, setNotifCount] = useState(0);
    const [announcementNotifCount, setAnnouncementNotifCount] = useState(0);
    const [unreadSenders, setUnreadSenders] = useState<Map<number, { patientName: string; doctorId: number }>>(new Map());
    const lastNotifCheckAtRef = useRef<string>(new Date(Date.now() - 60 * 1000).toISOString());

    const {
        data: profileData,
        isLoading: loading,
        revalidate: revalidateProfile
    } = useSWRLite('doctor:profile', getProfile);
    const profile = profileData?.doctor;

    const [upcomingToday, setUpcomingToday] = useState<any[]>([]);
    const [upcomingLoading, setUpcomingLoading] = useState(true);

    const loadUpcoming = React.useCallback(async () => {
        try {
            setUpcomingLoading(true);
            const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
            const todayStr = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIST.getUTCDate()).padStart(2, '0')}`;
            const all = await getAppointments({ date: todayStr });
            const list = Array.isArray(all) ? all : (all?.appointments || []);
            setUpcomingToday(list);
        } catch { console.log("Error loading upcoming appointments"); } finally { setUpcomingLoading(false); }
    }, []);

    useEffect(() => { loadUpcoming(); }, [loadUpcoming]);

    useFocusEffect(
        React.useCallback(() => {
            revalidateProfile().catch(() => {
                // ignore focus refresh errors
            });
        }, [revalidateProfile])
    );

    useEffect(() => {
        const checkNotifications = async () => {
            try {
                const data = await getChatNotifications(lastNotifCheckAtRef.current);
                lastNotifCheckAtRef.current = new Date().toISOString();
                setNotifCount((prev) => prev + (data?.count || 0));
                setAnnouncementNotifCount((prev) => prev + (data?.announcementCount || 0));
                if (data?.uniqueSenders?.length) {
                    setUnreadSenders((prev) => {
                        const next = new Map(prev);
                        data.uniqueSenders!.forEach((s) => {
                            next.set(s.patientId, { patientName: s.patientName, doctorId: s.doctorId });
                        });
                        return next;
                    });
                } else if (data?.latestMessage && !data.latestMessage.isAnnouncement) {
                    setUnreadSenders((prev) => {
                        const next = new Map(prev);
                        next.set(data.latestMessage!.patientId, {
                            patientName: data.latestMessage!.senderName,
                            doctorId: data.latestMessage!.doctorId,
                        });
                        return next;
                    });
                }
            } catch {
                // ignore periodic notification errors
            }
        };
        checkNotifications();
        const interval = setInterval(async () => {
            await checkNotifications();
        }, 12000);
        return () => clearInterval(interval);
    }, []);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            await revalidateProfile();
            await loadUpcoming();
        } finally {
            setRefreshing(false);
        }
    }, [revalidateProfile, loadUpcoming]);

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await removeToken();
                    navigation.replace('Login');
                },
            },
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading your profile...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-blue-700 ">
            <StatusBar barStyle="light-content" backgroundColor="#3032ceff" />
            <ScrollView
                className="flex-1 bg-gray-50"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1d4ed8']} />
                }
            >

                {/* Header */}
                <Animated.View
                    entering={FadeInDown.duration(600).springify()}
                    className="bg-blue-700 px-6 pt-16 pb-16 "

                >
                    <View className=" items-center gap-6 justify-between mb-4">
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('Profile')}
                            className="bg-white w-20 h-20 rounded-full items-center justify-center overflow-hidden"
                            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                        >
                            {profile?.profile_pic_url ? (
                                <Image
                                    source={{ uri: profile.profile_pic_url }}
                                    style={{ width: 80, height: 80, borderRadius: 999 }}
                                    resizeMode="cover"
                                />
                            ) : (
                                <User size={38} color="#1d4ed8" />
                            )}
                        </TouchableOpacity>
                        <View>
                            <Text className="text-blue-100 text-lg font-medium">Hello,</Text>
                            <Text className="text-white text-4xl font-bold">
                                Dr. {profile?.doctor_name}
                            </Text>
                        </View>


                    </View>
                </Animated.View>

                <View className="px-5 mt-6">
                    {/* Smart notification banner */}
                    {(unreadSenders.size > 0 || announcementNotifCount > 0) && (
                        <Animated.View entering={FadeInUp.delay(160).duration(400)} className="mb-4">
                            {unreadSenders.size > 0 && (() => {
                                const senders = [...unreadSenders.entries()];
                                const isSingle = senders.length === 1;
                                const names = senders.map(([, v]) => v.patientName).join(', ');
                                return (
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => {
                                            const snap = [...unreadSenders.entries()];
                                            // Clear immediately on tap
                                            setUnreadSenders(new Map());
                                            setNotifCount(0);
                                            if (snap.length === 1) {
                                                const [[pid, info]] = snap;
                                                navigation.navigate('Chat', {
                                                    patientId: pid,
                                                    doctorId: info.doctorId,
                                                    patientName: info.patientName,
                                                    viewer: 'DOCTOR',
                                                });
                                            } else {
                                                // Navigate to Patients tab
                                                navigation.navigate('DoctorMain');
                                            }
                                        }}
                                        className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex-row items-center"
                                    >
                                        <View className="flex-1">
                                            <Text className="text-amber-800 text-sm font-bold">
                                                {isSingle
                                                    ? ` New message from ${names}`
                                                    : ` ${senders.length} patients sent you messages`}
                                            </Text>
                                            {isSingle && (
                                                <Text className="text-amber-600 text-xs mt-0.5">Tap to open chat</Text>
                                            )}
                                            {!isSingle && (
                                                <Text className="text-amber-600 text-xs mt-0.5" numberOfLines={1}>{names}</Text>
                                            )}
                                        </View>
                                        <ArrowRight size={16} color="#92400e" />
                                    </TouchableOpacity>
                                );
                            })()}
                            {announcementNotifCount > 0 && (
                                <View className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mt-2">
                                    <Text className="text-blue-700 text-sm font-semibold">
                                        Announcements: {announcementNotifCount} new
                                    </Text>
                                </View>
                            )}
                        </Animated.View>
                    )}
                    {/* Quick Actions */}
                    <Animated.Text entering={FadeInUp.delay(200).duration(500)} className="text-gray-700 font-bold text-base mb-3">Quick Actions</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(240).duration(500)} className="mb-5">
                        <TouchableOpacity
                            onPress={() => navigation.navigate('DoctorAnnouncements')}
                            className="bg-blue-600 rounded-2xl py-4 px-4 flex-row items-center justify-between"
                            style={{ shadowColor: '#1d4ed8', shadowOpacity: 0.25, shadowRadius: 8, elevation: 5 }}
                        >
                            <View>
                                <Text className="text-white text-base font-bold">Send Announcement</Text>
                                <Text className="text-blue-100 text-xs mt-0.5">For your upcoming booked patients</Text>
                            </View>
                            <MessageCircle size={20} color="#ffffff" />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Today's Snapshot */}
                    {(() => {
                        const visited = upcomingToday.filter((a: any) => String(a?.status || '').toUpperCase() === 'COMPLETED').length;
                        const booked = upcomingToday.filter((a: any) => ['BOOKED', 'CONFIRMED'].includes(String(a?.status || '').toUpperCase())).length;
                        const pending = upcomingToday.filter((a: any) => String(a?.status || '').toUpperCase() === 'PENDING').length;
                        const total = upcomingToday.filter((a: any) => String(a?.status || '').toUpperCase() !== 'CANCELLED').length;

                        const stats = [
                            { label: 'Visited', value: visited, bg: '#f0fdf4', border: '#bbf7d0', icon: <CheckCircle2 size={20} color="#16a34a" />, num: '#16a34a' },
                            { label: 'Booked', value: booked, bg: '#eff6ff', border: '#bfdbfe', icon: <CalendarClock size={20} color="#2563eb" />, num: '#2563eb' },
                            { label: 'Pending', value: pending, icon: <UserX size={20} color="#d97706" />, num: '#d97706' },
                        ];

                        return (
                            <Animated.View entering={FadeInUp.delay(260).duration(500)} className="mb-5">
                                <View className="flex-row justify-between items-center mb-2">
                                    <Text className="text-gray-700 font-bold text-sm">Today's Snapshot</Text>
                                    {upcomingLoading
                                        ? <ActivityIndicator size="small" color="#2563eb" />
                                        : <Text className="text-gray-400 text-xs">{total} total</Text>}
                                </View>
                                <View className="flex-row" style={{ gap: 8 }}>
                                    {stats.map(s => (
                                        <TouchableOpacity
                                            key={s.label}
                                            onPress={() => navigation.navigate('DoctorMain')}
                                            activeOpacity={0.75}
                                            className="flex-1 flex-row items-center rounded-xl px-3 py-2"
                                            style={{ backgroundColor: s.bg, borderWidth: 1, borderColor: s.border }}
                                        >
                                            {s.icon}
                                            <View className="ml-2">
                                                <Text style={{ color: s.num, fontSize: 17, fontWeight: '800', lineHeight: 20 }}>
                                                    {upcomingLoading ? '–' : s.value}
                                                </Text>
                                                <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '600' }}>
                                                    {s.label}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </Animated.View>
                        );
                    })()}

                    {/* Profile Info */}
                    <Animated.Text entering={FadeInUp.delay(300).duration(500)} className="text-gray-700 font-bold text-base mb-3">Contact Info</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        <InfoCard icon={<Phone size={20} color="#4b5563" />} label="Phone" value={profile?.phone || 'N/A'} />
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default DashboardScreen;
