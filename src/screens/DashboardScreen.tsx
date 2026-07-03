import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    Modal,
    TextInput,
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
    ChevronLeft,
    Search,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getProfile } from '../api/auth';
import { getAppointments } from '../api/appointments';
import { getAllDoctors } from '../api/doctors';
import { removeToken } from '../api/token';
import { getChatNotifications } from '../api/notifications';
import { useSWRLite } from '../lib/useSWRLite';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthSession } from '../context/AuthSessionContext';
import { consumeDoctorReadPatientIds, getDoctorChatsReadAt } from '../lib/mobileNotificationState';

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
    const isFocused = useIsFocused();
    const { role, staff_role, staff_doctor_id, assigned_doctor_ids, name, email, clearSession, refreshSession } = useAuthSession();
    const isClinicStaff = role === 'CLINIC_STAFF';
    const normalizedAssignedDoctorIds = React.useMemo(
        () => Array.from(new Set((assigned_doctor_ids || []).map((doctorId) => Number(doctorId)).filter((doctorId) => Number.isFinite(doctorId) && doctorId > 0))),
        [assigned_doctor_ids]
    );
    const isHospitalStaff = isClinicStaff && normalizedAssignedDoctorIds.length > 1;
    const getClinicStaffProfile = React.useCallback(async () => ({ doctor: null }), []);
    const [refreshing, setRefreshing] = useState(false);
    const [notifCount, setNotifCount] = useState(0);
    const [announcementNotifCount, setAnnouncementNotifCount] = useState(0);
    const [unreadSenders, setUnreadSenders] = useState<Map<number, { patientName: string; doctorId: number }>>(new Map());
    const lastNotifCheckAtRef = useRef<string>(new Date(Date.now() - 60 * 1000).toISOString());
    const [doctorPickerVisible, setDoctorPickerVisible] = useState(false);
    const [doctorSearchText, setDoctorSearchText] = useState('');
    const [selectedDoctorId, setSelectedDoctorId] = useState<number | 'ALL'>('ALL');

    const {
        data: profileData,
        isLoading: loading,
        revalidate: revalidateProfile
    } = useSWRLite(
        isClinicStaff ? 'clinic-staff:profile' : 'doctor:profile',
        isClinicStaff ? getClinicStaffProfile : getProfile
    );
    const loadClinicStaffDoctorLookup = useCallback(async () => {
        if (!isClinicStaff || !staff_doctor_id) return null;
        const response = await getAllDoctors();
        const doctors = Array.isArray(response) ? response : (response?.doctors || []);
        const matchedDoctor = doctors.find((item: any) => Number(item?.doctor_id) === Number(staff_doctor_id));
        return matchedDoctor || null;
    }, [isClinicStaff, staff_doctor_id]);
    const { data: clinicStaffDoctorLookup } = useSWRLite(
        isClinicStaff && staff_doctor_id ? `clinic-staff:doctor:${staff_doctor_id}` : 'clinic-staff:doctor:none',
        loadClinicStaffDoctorLookup
    );
    const loadHospitalAssignedDoctors = useCallback(async () => {
        if (!isHospitalStaff || normalizedAssignedDoctorIds.length === 0) return [];
        const response = await getAllDoctors();
        const doctors = Array.isArray(response) ? response : (response?.doctors || []);
        return doctors
            .filter((item: any) => normalizedAssignedDoctorIds.includes(Number(item?.doctor_id)))
            .sort((a: any, b: any) => String(a?.doctor_name || '').localeCompare(String(b?.doctor_name || '')));
    }, [isHospitalStaff, normalizedAssignedDoctorIds]);
    const { data: hospitalAssignedDoctors, isLoading: hospitalDoctorsLoading } = useSWRLite(
        isHospitalStaff ? `clinic-staff:hospital-doctors:${normalizedAssignedDoctorIds.join(',')}` : 'clinic-staff:hospital-doctors:none',
        loadHospitalAssignedDoctors
    );
    const profile = profileData?.doctor;
    const displayName = isClinicStaff ? (name || (isHospitalStaff ? 'Hospital Staff' : 'Clinic Staff')) : (profile?.doctor_name || 'Doctor');
    const linkedDoctorName = String(clinicStaffDoctorLookup?.doctor_name || '').trim();
    const hospitalRoleLabel = staff_role ? String(staff_role).replace(/_/g, ' ') : 'Have Access';
    const roleBadgeLabel = isClinicStaff
        ? isHospitalStaff
            ? `Hospital Staff | ${hospitalRoleLabel}`
            : `Clinic Staff${staff_role ? ` | ${String(staff_role).replace(/_/g, ' ')}` : ''}`
        : 'Doctor';
    const assignedDoctors = React.useMemo(
        () => (Array.isArray(hospitalAssignedDoctors) ? hospitalAssignedDoctors : []),
        [hospitalAssignedDoctors]
    );
    const selectedDoctor = React.useMemo(() => {
        if (selectedDoctorId === 'ALL') return null;
        return assignedDoctors.find((doctor: any) => Number(doctor?.doctor_id) === Number(selectedDoctorId)) || null;
    }, [assignedDoctors, selectedDoctorId]);
    const filteredAssignedDoctors = React.useMemo(() => {
        const query = doctorSearchText.trim().toLowerCase();
        if (!query) return assignedDoctors;
        return assignedDoctors.filter((doctor: any) =>
            String(doctor?.doctor_name || '').toLowerCase().includes(query)
        );
    }, [assignedDoctors, doctorSearchText]);

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

    useEffect(() => {
        if (!isHospitalStaff) {
            setSelectedDoctorId('ALL');
            setDoctorSearchText('');
            setDoctorPickerVisible(false);
        }
    }, [isHospitalStaff]);

    useEffect(() => {
        if (!isHospitalStaff) return;
        if (selectedDoctorId === 'ALL') return;
        const doctorStillAssigned = assignedDoctors.some((doctor: any) => Number(doctor?.doctor_id) === Number(selectedDoctorId));
        if (!doctorStillAssigned) {
            setSelectedDoctorId('ALL');
        }
    }, [assignedDoctors, isHospitalStaff, selectedDoctorId]);

    useFocusEffect(
        React.useCallback(() => {
            const readPatientIds = consumeDoctorReadPatientIds();
            const latestDoctorChatsReadAt = getDoctorChatsReadAt();
            if (latestDoctorChatsReadAt > 0) {
                lastNotifCheckAtRef.current = new Date(Math.max(new Date(lastNotifCheckAtRef.current).getTime(), latestDoctorChatsReadAt)).toISOString();
            }
            if (readPatientIds.length > 0) {
                setUnreadSenders((prev) => {
                    const next = new Map(prev);
                    readPatientIds.forEach((patientId) => {
                        next.delete(patientId);
                    });
                    return next;
                });
            }
            setNotifCount((prev) => {
                const remainingCount = Math.max(0, unreadSenders.size - readPatientIds.length);
                return readPatientIds.length > 0 ? remainingCount : prev;
            });
            if (isClinicStaff) {
                refreshSession().catch(() => {
                    // ignore focus refresh errors
                });
                return;
            }
            revalidateProfile().catch(() => {
                // ignore focus refresh errors
            });
        }, [isClinicStaff, refreshSession, revalidateProfile, unreadSenders.size])
    );

    useEffect(() => {
        const checkNotifications = async () => {
            if (!isFocused) return;
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
        if (!isFocused) return;
        checkNotifications();
        const interval = setInterval(async () => {
            await checkNotifications();
        }, 12000);
        return () => clearInterval(interval);
    }, [isFocused]);

    const clearUnreadChatIndicators = React.useCallback(() => {
        setUnreadSenders(new Map());
        setNotifCount(0);
        lastNotifCheckAtRef.current = new Date().toISOString();
    }, []);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            if (isClinicStaff) {
                await refreshSession();
            } else {
                await revalidateProfile();
            }
            await loadUpcoming();
        } finally {
            setRefreshing(false);
        }
    }, [isClinicStaff, loadUpcoming, refreshSession, revalidateProfile]);

    const handleLogout = React.useCallback(() => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await removeToken();
                    clearSession();
                    navigation.replace('Login');
                },
            },
        ]);
    }, [clearSession, navigation]);

    const handleManageStaff = React.useCallback(() => {
        navigation.navigate('StaffList');
    }, [navigation]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading your profile...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#3032ceff" />
            <Modal visible={doctorPickerVisible} animationType="slide" onRequestClose={() => setDoctorPickerVisible(false)}>
                <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
                    <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
                    <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                        <TouchableOpacity
                            onPress={() => setDoctorPickerVisible(false)}
                            className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
                            activeOpacity={0.7}
                        >
                            <ChevronLeft size={20} color="#111827" />
                        </TouchableOpacity>
                        <View className="flex-1 ml-3">
                            <Text className="text-lg font-bold text-gray-900">Current Doctor</Text>
                            <Text className="text-xs text-gray-500">Choose one doctor or keep all doctors</Text>
                        </View>
                    </View>

                    <View className="px-4 pt-4">
                        <View className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex-row items-center">
                            <Search size={18} color="#6b7280" />
                            <TextInput
                                value={doctorSearchText}
                                onChangeText={setDoctorSearchText}
                                placeholder="Search doctor"
                                placeholderTextColor="#9ca3af"
                                className="flex-1 ml-3 text-gray-800 text-base"
                            />
                        </View>
                    </View>

                    <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => {
                                setSelectedDoctorId('ALL');
                                setDoctorPickerVisible(false);
                            }}
                            className={`rounded-2xl px-4 py-4 mb-3 border ${selectedDoctorId === 'ALL' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
                        >
                            <Text className={`text-base font-bold ${selectedDoctorId === 'ALL' ? 'text-blue-700' : 'text-gray-900'}`}>All Doctors</Text>
                            <Text className={`text-xs mt-1 ${selectedDoctorId === 'ALL' ? 'text-blue-600' : 'text-gray-500'}`}>
                                Combined snapshot for all assigned doctors
                            </Text>
                        </TouchableOpacity>

                        {hospitalDoctorsLoading ? (
                            <View className="py-10 items-center">
                                <ActivityIndicator size="small" color="#2563eb" />
                            </View>
                        ) : filteredAssignedDoctors.length > 0 ? (
                            filteredAssignedDoctors.map((doctor: any) => {
                                const doctorId = Number(doctor?.doctor_id || 0);
                                const isSelected = selectedDoctorId !== 'ALL' && Number(selectedDoctorId) === doctorId;
                                return (
                                    <TouchableOpacity
                                        key={doctorId}
                                        activeOpacity={0.75}
                                        onPress={() => {
                                            setSelectedDoctorId(doctorId);
                                            setDoctorPickerVisible(false);
                                        }}
                                        className={`rounded-2xl px-4 py-4 mb-3 border ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`text-base font-bold ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                                            Dr. {String(doctor?.doctor_name || 'Doctor').trim()}
                                        </Text>
                                        {!!doctor?.specialization && (
                                            <Text className={`text-xs mt-1 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                                                {doctor.specialization}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View className="bg-white rounded-2xl border border-gray-200 px-4 py-6 items-center">
                                <Text className="text-sm font-semibold text-gray-700">No doctors found</Text>
                                <Text className="text-xs text-gray-500 mt-1">Try another search term.</Text>
                            </View>
                        )}
                    </ScrollView>
                </SafeAreaView>
            </Modal>
            <ScrollView
                className="flex-1 bg-gray-50"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1d4ed8']} />
                }
            >

                <SafeAreaView edges={['top']} className="bg-blue-700">
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
                            {!isClinicStaff && profile?.profile_pic_url ? (
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
                                {isClinicStaff ? displayName : `Dr. ${displayName}`}
                            </Text>
                            {isClinicStaff && !isHospitalStaff && linkedDoctorName ? (
                                <View className="self-center mt-3 bg-white/15 border border-white/20 rounded-full px-3 py-1.5">
                                    <Text className="text-white text-xs font-bold">Dr. {linkedDoctorName}</Text>
                                </View>
                            ) : (
                                <View className={`${isHospitalStaff ? 'self-center' : 'self-start'} mt-3 bg-white/15 border border-white/20 rounded-full px-3 py-1.5`}>
                                    <Text className="text-white text-xs font-bold">{roleBadgeLabel}</Text>
                                </View>
                            )}
                            {isClinicStaff && !isHospitalStaff ? (
                                <Text className="text-blue-100 text-sm mt-2 text-center">{roleBadgeLabel}</Text>
                            ) : null}
                        </View>


                        </View>
                    </Animated.View>
                </SafeAreaView>

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
                                            clearUnreadChatIndicators();
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
                    {!isClinicStaff && (
                        <>
                            {/* Quick Actions */}
                            <Animated.Text entering={FadeInUp.delay(200).duration(500)} className="text-gray-700 font-bold text-base mb-3">Quick Actions</Animated.Text>
                            <Animated.View entering={FadeInUp.delay(240).duration(500)} className="mb-5" style={{ gap: 10 }}>
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
                                <TouchableOpacity
                                    onPress={handleManageStaff}
                                    className="bg-sky-100 rounded-2xl py-4 px-4 flex-row items-center justify-between border border-sky-200"
                                    style={{ shadowColor: '#bae6fd', shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}
                                >
                                    <View>
                                        <Text className="text-sky-900 text-base font-bold">Manage Staff</Text>
                                        <Text className="text-sky-700 text-xs mt-0.5">Create, update, and remove clinic staff</Text>
                                    </View>
                                    <Briefcase size={20} color="#0c4a6e" />
                                </TouchableOpacity>
                            </Animated.View>
                        </>
                    )}

                    {isHospitalStaff && (
                        <Animated.View entering={FadeInUp.delay(220).duration(500)} className="mb-5">
                            <Text className="text-gray-700 font-bold text-sm mb-2">Current Doctor</Text>
                            <TouchableOpacity
                                onPress={() => setDoctorPickerVisible(true)}
                                activeOpacity={0.75}
                                className="bg-white border border-gray-200 rounded-2xl px-4 py-4 flex-row items-center justify-between"
                                style={{
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.05,
                                    shadowRadius: 6,
                                    elevation: 2,
                                }}
                            >
                                <View className="flex-1 pr-3">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Selection</Text>
                                    <Text className="text-base font-bold text-gray-900">
                                        {selectedDoctorId === 'ALL'
                                            ? 'All Doctors'
                                            : `Dr. ${String(selectedDoctor?.doctor_name || 'Doctor').trim()}`}
                                    </Text>
                                </View>
                                <ArrowRight size={18} color="#6b7280" />
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {/* Today's Snapshot */}
                    {(() => {
                        const scopedAppointments = isHospitalStaff && selectedDoctorId !== 'ALL'
                            ? upcomingToday.filter((appointment: any) => Number(appointment?.doctor_id ?? appointment?.doctor?.doctor_id ?? 0) === Number(selectedDoctorId))
                            : upcomingToday;
                        const visited = scopedAppointments.filter((a: any) => String(a?.status || '').toUpperCase() === 'COMPLETED').length;
                        const booked = scopedAppointments.filter((a: any) => ['BOOKED', 'CONFIRMED'].includes(String(a?.status || '').toUpperCase())).length;
                        const pending = scopedAppointments.filter((a: any) => String(a?.status || '').toUpperCase() === 'PENDING').length;
                        const total = scopedAppointments.filter((a: any) => String(a?.status || '').toUpperCase() !== 'CANCELLED').length;

                        const stats = [
                            { label: 'Visited', value: visited, bg: '#f0fdf4', border: '#bbf7d0', icon: <CheckCircle2 size={20} color="#16a34a" />, num: '#16a34a' },
                            { label: 'Booked', value: booked, bg: '#eff6ff', border: '#bfdbfe', icon: <CalendarClock size={20} color="#2563eb" />, num: '#2563eb' },
                            { label: 'Not Visited', value: pending, bg: '#fff7ed', border: '#fed7aa', icon: <UserX size={20} color="#d97706" />, num: '#d97706' },
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
                        <InfoCard
                            icon={isClinicStaff ? <User size={20} color="#4b5563" /> : <Phone size={20} color="#4b5563" />}
                            label={isClinicStaff ? 'Email' : 'Phone'}
                            value={isClinicStaff ? (email || 'N/A') : (profile?.phone || 'N/A')}
                        />
                        {isClinicStaff && (
                            <InfoCard
                                icon={<Briefcase size={20} color="#4b5563" />}
                                label="Access Level"
                                value={staff_role ? String(staff_role).replace(/_/g, ' ') : 'Clinic Staff'}
                            />
                        )}
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default DashboardScreen;
