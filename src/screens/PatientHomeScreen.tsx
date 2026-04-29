import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
    RefreshControl,
    StatusBar,
    Modal,
    ScrollView,
    Image,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, ChevronLeft, ChevronRight, User, MessageCircle, Settings } from 'lucide-react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPatientProfile, updatePatientProfile } from '../api/auth';
import { getPatientAppointments } from '../api/patientAppointments';
import { getChatNotifications, type IncomingNotificationMessage } from '../api/notifications';
import { useSWRLite } from '../lib/useSWRLite';
import { FlashList } from '@shopify/flash-list';
import IncomingMessageBubble from '../components/IncomingMessageBubble';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import { useAuthSession } from '../context/AuthSessionContext';
import {
    consumePatientReadDoctorChatEvents,
    ensurePatientAnnouncementsStateHydrated,
    getPatientAnnouncementsReadAt,
    getPatientAnnouncementsUnreadCount,
    incrementPatientAnnouncementsUnread,
    markPatientAnnouncementsRead,
    subscribePatientAnnouncementsState,
} from '../lib/mobileNotificationState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DoctorItem {
    doctor_id: number;
    doctor_name: string | null;
    specialization: string | null;
    phone: string | null;
    profile_pic_url?: string | null;
    relation_type?: 'SELF' | 'OTHER';
}

type AppointmentItem = {
    appointment_id: number;
    booking_id?: number;
    appointment_date?: string;
    start_time?: string;
    status?: string;
    cancelled_by?: string | null;
    relation_type?: 'SELF' | 'OTHER';
    relation_label?: string;
    doctor?: { doctor_id: number };
    clinic?: { clinic_id: number; clinic_name?: string | null };
    patient?: { booking_id?: number | null; full_name?: string | null };
};

const toYMD = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const toHM = (value?: string) => {
    if (!value) return '';
    if (String(value).includes(':') && String(value).length <= 5) return String(value).slice(0, 5);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

const to12h = (time?: string) => {
    if (!time) return '';
    if (/AM|PM/i.test(time)) return time;
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (!match) return time;
    let hour = parseInt(match[1], 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${match[2]} ${ampm}`;
};

const formatDateOnly = (date?: string) => {
    if (!date) return 'N/A';
    const ymd = toYMD(date);
    if (!ymd) return 'N/A';
    return new Date(ymd).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });
};

const formatTimeOnly = (time?: string) => {
    const hm = toHM(time);
    if (!hm) return 'N/A';
    return to12h(hm);
};

const formatDoctorName = (name?: string | null) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return 'Doctor';
    if (/^dr\./i.test(trimmed)) return trimmed;
    return `Dr. ${trimmed}`;
};

const getAppointmentNo = (item?: AppointmentItem | null) => {
    if (!item) return null;
    return item.booking_id ?? item.patient?.booking_id ?? item.appointment_id ?? null;
};

const getRelationBadgeText = (item?: AppointmentItem | null) => {
    if (!item) return '';
    if (item.relation_label) return item.relation_label;
    if (item.relation_type === 'OTHER') {
        const otherName = String(item.patient?.full_name || '').trim() || 'Patient';
        return `Other: ${otherName}`;
    }
    return 'Self';
};

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (value: number) => String(value).padStart(2, '0');
const ymdFromParts = (year: number, month: number, day: number) =>
    `${year}-${pad2(month)}-${pad2(day)}`;

const getTodayYMD = () => {
    const now = new Date();
    return ymdFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const formatDob = (value?: string) => {
    if (!value) return 'Select date of birth';
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(date.getTime())) return 'Select date of birth';

    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
};

const calculateAgeFromDob = (dob: string) => {
    if (!dob) return null;
    const [year, month, day] = dob.split('-').map(Number);
    const birthDate = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
        today.getMonth() > birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

    if (!hasHadBirthdayThisYear) age -= 1;
    if (age < 0 || age > 150) return null;
    return age;
};

export default function PatientHomeScreen() {
    type HistoryFilter = 'TODAY' | 'TOMORROW' | 'UPCOMING';
    const navigation = useNavigation<Nav>();
    const isFocused = useIsFocused();
    const { clearSession, refreshSession } = useAuthSession();
    const [refreshing, setRefreshing] = useState(false);
    const [announcementCount, setAnnouncementCount] = useState(getPatientAnnouncementsUnreadCount());
    const [incomingMessage, setIncomingMessage] = useState<IncomingNotificationMessage | null>(null);
    const [unreadChatCountsByDoctor, setUnreadChatCountsByDoctor] = useState<Map<number, number>>(new Map());
    const [latestBookedAppointmentByDoctor, setLatestBookedAppointmentByDoctor] = useState<Map<number, AppointmentItem>>(new Map());
    const [appointmentsByDoctor, setAppointmentsByDoctor] = useState<Map<number, AppointmentItem[]>>(new Map());
    const [historyDoctor, setHistoryDoctor] = useState<DoctorItem | null>(null);
    const [historyVisible, setHistoryVisible] = useState(false);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('TODAY');
    const [profileCompletionVisible, setProfileCompletionVisible] = useState(false);
    const [profileCompletionSaving, setProfileCompletionSaving] = useState(false);
    const [completionDob, setCompletionDob] = useState('');
    const [completionGender, setCompletionGender] = useState('');
    const [showDobCalendar, setShowDobCalendar] = useState(false);
    const [showYearPicker, setShowYearPicker] = useState(false);
    const [dobMonth, setDobMonth] = useState(() => {
        const today = new Date();
        return { year: today.getFullYear(), month: today.getMonth() };
    });
    const lastNotifCheckAtRef = useRef<string>(new Date(Date.now() - 2 * 60 * 1000).toISOString());
    const bubbleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const yearScrollRef = useRef<ScrollView | null>(null);
    const socketEnabled = React.useMemo(() => !SOCKET_URL.includes('vercel.app'), []);
    const lastHandledAnnouncementsReadAtRef = useRef<number>(0);
    const patientReadDoctorAtRef = useRef<Map<number, number>>(new Map());

    const { data, isLoading: loading, revalidate } = useSWRLite('patient:home', getPatientProfile);
    const patient = data?.patient || null;
    const hasOtherContext = useMemo(
        () => ((data?.linked_profiles || []) as Array<{ profile_type?: string | null }>).some((item) => String(item?.profile_type || '').toUpperCase() === 'OTHER'),
        [data?.linked_profiles]
    );
    const doctors = (data?.doctors || []) as DoctorItem[];
    const todayIST = useMemo(() => {
        const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    }, []);
    const tomorrowIST = useMemo(() => {
        const next = new Date(`${todayIST}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    }, [todayIST]);
    const uniqueDoctors = useMemo(() => {
        const byId = new Map<number, DoctorItem>();
        doctors.forEach((d) => {
            if (!d || !d.doctor_id) return;
            if (!byId.has(d.doctor_id)) byId.set(d.doctor_id, d);
        });
        return Array.from(byId.values());
    }, [doctors]);
    const notifCount = useMemo(
        () => Array.from(unreadChatCountsByDoctor.values()).reduce((sum, count) => sum + count, 0),
        [unreadChatCountsByDoctor]
    );
    const profileNeedsCompletion = useMemo(
        () => Boolean(patient && (!patient.age || !String(patient.gender || '').trim())),
        [patient]
    );
    const shouldShowSignupOnboarding = useMemo(
        () =>
            Boolean(
                patient &&
                patient.profile_type === 'SELF' &&
                patient.doctor_id == null &&
                patient.booking_id == null &&
                uniqueDoctors.length === 0 &&
                appointmentsByDoctor.size === 0
            ),
        [appointmentsByDoctor.size, patient, uniqueDoctors.length]
    );
    const computedCompletionAge = useMemo(() => calculateAgeFromDob(completionDob), [completionDob]);
    const maxDob = getTodayYMD();
    const selectedDobDate = useMemo(
        () => (completionDob ? new Date(`${completionDob}T00:00:00`) : null),
        [completionDob]
    );
    const selectedYear = useMemo(() => {
        if (selectedDobDate && !Number.isNaN(selectedDobDate.getTime())) {
            return selectedDobDate.getFullYear();
        }
        return dobMonth.year;
    }, [dobMonth.year, selectedDobDate]);

    useEffect(() => {
        if (!patient) return;
        setCompletionGender(patient.gender || '');
        if (!profileNeedsCompletion) {
            setProfileCompletionVisible(false);
            setShowDobCalendar(false);
            setShowYearPicker(false);
            setCompletionDob('');
            return;
        }
        setProfileCompletionVisible(true);
    }, [patient, profileNeedsCompletion]);

    useEffect(() => {
        if (!showYearPicker) return;

        const currentYear = new Date().getFullYear();
        const boundedYear = Math.min(Math.max(selectedYear, 1900), currentYear);
        const yearIndex = boundedYear - 1900;
        const estimatedChipWidth = 74;
        const offset = Math.max(0, yearIndex * estimatedChipWidth - estimatedChipWidth * 2);

        const timer = setTimeout(() => {
            yearScrollRef.current?.scrollTo({ x: offset, animated: false });
        }, 50);

        return () => clearTimeout(timer);
    }, [selectedYear, showYearPicker]);

    useEffect(() => {
        void ensurePatientAnnouncementsStateHydrated().then(() => {
            setAnnouncementCount(getPatientAnnouncementsUnreadCount());
        });
        const unsubscribe = subscribePatientAnnouncementsState(() => {
            setAnnouncementCount(getPatientAnnouncementsUnreadCount());
        });
        return unsubscribe;
    }, []);

    const incrementUnreadDoctorCount = React.useCallback((doctorId: number, amount: number = 1, createdAt?: string) => {
        if (!doctorId || amount <= 0) return;
        const messageTs = createdAt ? new Date(createdAt).getTime() : Date.now();
        const lastReadAt = patientReadDoctorAtRef.current.get(doctorId) || 0;
        if (messageTs <= lastReadAt) return;
        setUnreadChatCountsByDoctor((prev) => {
            const next = new Map(prev);
            next.set(doctorId, (next.get(doctorId) || 0) + amount);
            return next;
        });
    }, []);

    const clearDoctorUnreadCount = React.useCallback((doctorId?: number | null) => {
        if (!doctorId) return;
        patientReadDoctorAtRef.current.set(doctorId, Date.now());
        setUnreadChatCountsByDoctor((prev) => {
            if (!prev.has(doctorId)) return prev;
            const next = new Map(prev);
            next.delete(doctorId);
            return next;
        });
        setIncomingMessage((prev) => (prev && !prev.isAnnouncement && prev.doctorId === doctorId ? null : prev));
        if (bubbleHideTimerRef.current) {
            clearTimeout(bubbleHideTimerRef.current);
            bubbleHideTimerRef.current = null;
        }
    }, []);

    const loadLatestAppointments = React.useCallback(async () => {
        try {
            const res = await getPatientAppointments();
            const list = (res?.appointments || []) as AppointmentItem[];
            const nextBooked = new Map<number, AppointmentItem>();
            const byDoctor = new Map<number, AppointmentItem[]>();
            list.forEach((item) => {
                const doctorId = item?.doctor?.doctor_id;
                if (!doctorId) return;
                const items = byDoctor.get(doctorId) || [];
                items.push(item);
                byDoctor.set(doctorId, items);
            });
            byDoctor.forEach((items, doctorId) => {
                const sorted = [...items].sort((a, b) => {
                    const aYmd = toYMD(a.appointment_date);
                    const aHm = toHM(a.start_time);
                    const aTs = aYmd && aHm ? new Date(`${aYmd}T${aHm}:00`).getTime() : 0;
                    const bYmd = toYMD(b.appointment_date);
                    const bHm = toHM(b.start_time);
                    const bTs = bYmd && bHm ? new Date(`${bYmd}T${bHm}:00`).getTime() : 0;
                    return bTs - aTs;
                });
                byDoctor.set(doctorId, sorted);
                const upcomingBooked = sorted
                    .filter((appointment) => {
                        const appointmentYmd = toYMD(appointment.appointment_date);
                        return Boolean(appointmentYmd) &&
                            appointmentYmd >= todayIST &&
                            String(appointment.status || '').toUpperCase() === 'BOOKED';
                    })
                    .sort((a, b) => {
                        const aYmd = toYMD(a.appointment_date);
                        const aHm = toHM(a.start_time);
                        const aTs = aYmd && aHm ? new Date(`${aYmd}T${aHm}:00`).getTime() : Number.MAX_SAFE_INTEGER;
                        const bYmd = toYMD(b.appointment_date);
                        const bHm = toHM(b.start_time);
                        const bTs = bYmd && bHm ? new Date(`${bYmd}T${bHm}:00`).getTime() : Number.MAX_SAFE_INTEGER;
                        return aTs - bTs;
                    })[0];
                if (upcomingBooked) {
                    nextBooked.set(doctorId, upcomingBooked);
                }
            });
            setLatestBookedAppointmentByDoctor(nextBooked);
            setAppointmentsByDoctor(byDoctor);
        } catch {
            // ignore appointment load errors on dashboard
        }
    }, [todayIST]);

    const checkIncomingNotifications = React.useCallback(async () => {
        if (!isFocused) return;
        try {
            const result = await getChatNotifications(lastNotifCheckAtRef.current);
            lastNotifCheckAtRef.current = new Date().toISOString();
            if (result?.announcementCount) {
                incrementPatientAnnouncementsUnread(result.announcementCount);
            }
            if (result?.uniqueSenders?.length) {
                result.uniqueSenders.forEach((sender: any) => {
                    const doctorId = Number(sender?.doctorId);
                    incrementUnreadDoctorCount(doctorId, 1);
                });
            } else if (result?.latestMessage && !result.latestMessage.isAnnouncement) {
                incrementUnreadDoctorCount(result.latestMessage.doctorId, Math.max(1, result.count || 1), result.latestMessage.createdAt);
            }
            if (result?.latestMessage) {
                setIncomingMessage({
                    ...result.latestMessage,
                    preview: (result.latestMessage.isAnnouncement
                        ? result.latestMessage.preview?.replace(/^Announcement:\s*/, '')
                        : result.latestMessage.preview) || '',
                });
                if (bubbleHideTimerRef.current) {
                    clearTimeout(bubbleHideTimerRef.current);
                }
                bubbleHideTimerRef.current = setTimeout(() => {
                    setIncomingMessage(null);
                }, 5000);
            }
        } catch {
            // ignore
        }
    }, [incrementUnreadDoctorCount, isFocused]);

    useEffect(() => {
        if (!isFocused) {
            setIncomingMessage(null);
            return;
        }
        checkIncomingNotifications();
        const interval = setInterval(checkIncomingNotifications, 7000);
        return () => {
            clearInterval(interval);
            if (bubbleHideTimerRef.current) {
                clearTimeout(bubbleHideTimerRef.current);
            }
        };
    }, [checkIncomingNotifications, isFocused]);

    useEffect(() => {
        if (!isFocused) return;
        loadLatestAppointments();
    }, [isFocused, loadLatestAppointments]);

    useEffect(() => {
        if (!isFocused) return;
        revalidate().catch(() => undefined);
    }, [isFocused, revalidate]);

    useEffect(() => {
        if (!isFocused) return;
        const interval = setInterval(() => {
            loadLatestAppointments().catch(() => undefined);
        }, 12000);
        return () => clearInterval(interval);
    }, [isFocused, loadLatestAppointments]);

    useFocusEffect(
        React.useCallback(() => {
            const patientReadEvents = consumePatientReadDoctorChatEvents();
            if (patientReadEvents.length > 0) {
                patientReadEvents.forEach(({ doctorId, readAt }) => {
                    patientReadDoctorAtRef.current.set(doctorId, readAt || Date.now());
                });
                setUnreadChatCountsByDoctor((prev) => {
                    const next = new Map(prev);
                    patientReadEvents.forEach(({ doctorId }) => next.delete(doctorId));
                    return next;
                });
            }
            if (!isFocused) return;
            const latestAnnouncementReadAt = getPatientAnnouncementsReadAt();
            if (latestAnnouncementReadAt > lastHandledAnnouncementsReadAtRef.current) {
                lastHandledAnnouncementsReadAtRef.current = latestAnnouncementReadAt;
                setAnnouncementCount(0);
                setIncomingMessage((prev) => (prev?.isAnnouncement ? null : prev));
            }
            checkIncomingNotifications();
        }, [checkIncomingNotifications, isFocused])
    );

    useEffect(() => {
        if (!isFocused) return;
        if (!socketEnabled) return;
        if (!patient?.patient_id || uniqueDoctors.length === 0) return;
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;

        const joinAllRooms = () => {
            uniqueDoctors.forEach((d) => {
                socket.emit('join_chat', { patientId: patient.patient_id, doctorId: d.doctor_id });
            });
        };

        socket.on('connect', joinAllRooms);
        socket.on('receive_message', (msg: any) => {
            if (!msg || msg.sender !== 'DOCTOR') return;
            if (msg.patient_id !== patient.patient_id) return;
            const isAnnouncement = String(msg.content || '').startsWith('Announcement:');
            const senderName = uniqueDoctors.find((d) => d.doctor_id === msg.doctor_id)?.doctor_name || 'Doctor';
            if (isAnnouncement) {
                incrementPatientAnnouncementsUnread(1);
            } else {
                incrementUnreadDoctorCount(msg.doctor_id, 1, msg.created_at);
            }
            setIncomingMessage({
                senderName,
                senderRole: 'DOCTOR',
                preview: isAnnouncement ? String(msg.content || '').replace(/^Announcement:\s*/, '') : (msg.content || ''),
                isAnnouncement,
                createdAt: msg.created_at || new Date().toISOString(),
                patientId: msg.patient_id,
                doctorId: msg.doctor_id,
            });
            if (bubbleHideTimerRef.current) {
                clearTimeout(bubbleHideTimerRef.current);
            }
            bubbleHideTimerRef.current = setTimeout(() => {
                setIncomingMessage(null);
            }, 5000);
        });
        if (socket.connected) joinAllRooms();

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [incrementUnreadDoctorCount, isFocused, uniqueDoctors, patient?.patient_id, socketEnabled]);

    const dismissIncomingMessage = React.useCallback(() => {
        setIncomingMessage(null);
        if (bubbleHideTimerRef.current) {
            clearTimeout(bubbleHideTimerRef.current);
            bubbleHideTimerRef.current = null;
        }
    }, []);

    const clearAnnouncementIndicators = React.useCallback(() => {
        markPatientAnnouncementsRead();
        lastHandledAnnouncementsReadAtRef.current = getPatientAnnouncementsReadAt();
        setAnnouncementCount(0);
        setIncomingMessage((prev) => (prev?.isAnnouncement ? null : prev));
        lastNotifCheckAtRef.current = new Date().toISOString();
        if (bubbleHideTimerRef.current) {
            clearTimeout(bubbleHideTimerRef.current);
            bubbleHideTimerRef.current = null;
        }
    }, []);

    const handleOpenDoctorChat = React.useCallback((doctorId: number, doctorName: string, profilePicUrl?: string | null) => {
        if (!patient?.patient_id) return;
        clearDoctorUnreadCount(doctorId);
        dismissIncomingMessage();
        navigation.navigate('Chat', {
            patientId: patient.patient_id,
            doctorId,
            patientName: doctorName || 'Doctor',
            profilePicUrl: profilePicUrl || null,
            viewer: 'PATIENT',
        });
    }, [clearDoctorUnreadCount, dismissIncomingMessage, navigation, patient?.patient_id]);

    const handleOpenDoctorHistory = React.useCallback(async (doctor: DoctorItem) => {
        setHistoryDoctor(doctor);
        setHistoryFilter('TODAY');
        setHistoryVisible(true);
        if (appointmentsByDoctor.size === 0) {
            await loadLatestAppointments();
        }
    }, [appointmentsByDoctor.size, loadLatestAppointments]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            revalidate().catch(() => {
                Alert.alert("Error", "Failed to load patient data");
            }),
            loadLatestAppointments(),
        ]);
        setRefreshing(false);
    };

    const renderDobCalendar = () => {
        const { year, month } = dobMonth;
        const firstDow = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: (number | null)[] = [
            ...Array(firstDow).fill(null),
            ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
        ];

        while (cells.length % 7 !== 0) cells.push(null);

        const prevMonth = () => setDobMonth(({ year: y, month: m }) => {
            if (m === 0) return { year: y - 1, month: 11 };
            return { year: y, month: m - 1 };
        });

        const nextMonth = () => setDobMonth(({ year: y, month: m }) => {
            if (m === 11) return { year: y + 1, month: 0 };
            return { year: y, month: m + 1 };
        });

        const monthName = new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: currentYear - 1900 + 1 }, (_, index) => 1900 + index);

        return (
            <View className="border border-gray-200 rounded-2xl overflow-hidden bg-white mt-3">
                <View className="flex-row items-center justify-between px-4 py-3 bg-blue-50">
                    <TouchableOpacity onPress={prevMonth} className="p-1 rounded-full">
                        <ChevronLeft size={18} color="#1d4ed8" />
                    </TouchableOpacity>
                    <View className="flex-row items-center">
                        <Text className="text-blue-800 font-bold text-sm mr-2">{monthName}</Text>
                        <TouchableOpacity
                            onPress={() => setShowYearPicker((prev) => !prev)}
                            className="px-2.5 py-1 rounded-full bg-white border border-blue-200"
                        >
                            <Text className="text-xs font-bold text-blue-700">{year}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={nextMonth} className="p-1 rounded-full">
                        <ChevronRight size={18} color="#1d4ed8" />
                    </TouchableOpacity>
                </View>

                {showYearPicker ? (
                    <View className="border-b border-gray-100 bg-white px-3 py-3">
                        <ScrollView
                            ref={yearScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingRight: 12 }}
                        >
                            <View className="flex-row">
                                {years.map((optionYear) => {
                                    const isSelectedYear = optionYear === selectedYear;
                                    return (
                                        <TouchableOpacity
                                            key={optionYear}
                                            onPress={() => {
                                                setDobMonth((prev) => ({ ...prev, year: optionYear }));
                                                setShowYearPicker(false);
                                            }}
                                            className={`mr-2 rounded-xl border px-3 py-2 ${
                                                isSelectedYear ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                                            }`}
                                        >
                                            <Text className={`text-xs font-semibold ${isSelectedYear ? 'text-blue-700' : 'text-gray-700'}`}>
                                                {optionYear}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                ) : null}

                <View className="flex-row bg-gray-50">
                    {DAY_LABELS.map((label) => (
                        <View key={label} className="flex-1 items-center py-1.5">
                            <Text className="text-xs text-gray-400 font-semibold">{label}</Text>
                        </View>
                    ))}
                </View>

                <View className="px-2 pb-3 pt-2">
                    {Array.from({ length: cells.length / 7 }, (_, row) => (
                        <View key={row} className="flex-row">
                            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                                if (!day) return <View key={`${row}-${col}`} className="flex-1 m-1" />;

                                const dateStr = ymdFromParts(year, month + 1, day);
                                const isSelected = dateStr === completionDob;
                                const isDisabled = dateStr > maxDob;

                                return (
                                    <TouchableOpacity
                                        key={`${row}-${col}`}
                                        onPress={() => {
                                            if (isDisabled) return;
                                            setCompletionDob(dateStr);
                                            setShowDobCalendar(false);
                                            setShowYearPicker(false);
                                        }}
                                        disabled={isDisabled}
                                        className={`flex-1 m-1 h-9 items-center justify-center rounded-xl ${
                                            isSelected ? 'bg-blue-600' : 'bg-transparent'
                                        } ${isDisabled ? 'opacity-25' : 'opacity-100'}`}
                                    >
                                        <Text className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                                            {day}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    const handleCompleteProfile = async () => {
        const nextGender = String(completionGender || '').trim();
        const ageToSave = patient?.age ?? computedCompletionAge;

        if (!ageToSave) {
            Alert.alert('Complete Profile', 'Please select your date of birth to calculate age.');
            return;
        }

        if (!nextGender) {
            Alert.alert('Complete Profile', 'Please select your gender.');
            return;
        }

        setProfileCompletionSaving(true);
        try {
            await updatePatientProfile({
                age: ageToSave,
                gender: nextGender,
            });
            await Promise.all([
                refreshSession(),
                revalidate(),
            ]);
            setProfileCompletionVisible(false);
            setShowDobCalendar(false);
            setShowYearPicker(false);
            setCompletionDob('');
        } catch (error: any) {
            Alert.alert('Update Failed', error?.response?.data?.error || 'Failed to complete profile.');
        } finally {
            setProfileCompletionSaving(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <View className="flex-1 bg-gray-50">
                <SafeAreaView edges={['top']} className="bg-blue-700 rounded-b-3xl overflow-hidden">
                    <View className="bg-blue-700 px-5 pt-6 pb-6">
                        <View className="flex-row items-center justify-between">
                            <View>
                                <Text className="text-blue-100 text-sm">Patient Portal</Text>
                                <Text className="text-white text-3xl font-bold mt-1">{patient?.full_name || "Patient"}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('PatientProfile')}
                                className="bg-white/20 rounded-full p-2"
                            >
                                <Settings size={22} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>

                <FlashList
                    data={uniqueDoctors}
                    keyExtractor={(item, index) => `doctor:${item.doctor_id}:${index}`}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListHeaderComponent={
                        <View className="mb-2">
                            {(notifCount > 0 || announcementCount > 0) && (
                                <View className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    <Text className="text-amber-700 text-xs font-semibold">
                                        {notifCount > 0 ? `${notifCount} new chat message${notifCount === 1 ? '' : 's'}` : ''}
                                        {notifCount > 0 && announcementCount > 0 ? '  •  ' : ''}
                                        {announcementCount > 0 ? `${announcementCount} new announcement${announcementCount === 1 ? '' : 's'}` : ''}
                                    </Text>
                                </View>
                            )}
                            {!shouldShowSignupOnboarding ? (
                                <Text className="text-gray-700 font-bold text-base">My Doctors</Text>
                            ) : null}
                        </View>
                    }
                    renderItem={({ item }) => {
                        const unreadCount = unreadChatCountsByDoctor.get(item.doctor_id) || 0;
                        return (
                        <TouchableOpacity
                            className="bg-white rounded-2xl p-4 mb-2 flex-row items-center"
                            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }}
                            disabled={!patient?.patient_id}
                            onPress={() => handleOpenDoctorHistory(item)}
                        >
                            <View className="mr-3 relative">
                                <View className="w-11 h-11 rounded-full items-center justify-center overflow-hidden bg-blue-100">
                                    {item.profile_pic_url ? (
                                        <Image
                                            source={{ uri: item.profile_pic_url }}
                                            className="w-11 h-11"
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <User size={20} color="#1d4ed8" />
                                    )}
                                </View>
                                {incomingMessage && !incomingMessage.isAnnouncement && incomingMessage.doctorId === item.doctor_id ? (
                                    <View className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 items-center justify-center border border-white">
                                        <Text className="text-white text-[10px] font-bold">1</Text>
                                    </View>
                                ) : null}
                            </View>
                            <View className="flex-1">
                                <Text className="text-gray-800 font-bold">
                                    {item.doctor_name ? `Dr. ${item.doctor_name}` : "Doctor"}
                                </Text>
                                <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                                    <View className="self-start bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                        <Text className="text-[10px] font-semibold text-emerald-700">
                                            {item.specialization || 'General'}
                                        </Text>
                                    </View>
                                    {(() => {
                                        const appt = latestBookedAppointmentByDoctor.get(item.doctor_id);
                                        const badgeText = hasOtherContext ? getRelationBadgeText(appt) : '';
                                        if (!badgeText) return null;
                                        return (
                                            <View
                                                className={`self-start max-w-[104px] items-center px-2 py-0.5 rounded-full ${
                                                    appt?.relation_type === 'OTHER' ? 'bg-amber-50 border border-amber-200' : 'bg-sky-50 border border-sky-200'
                                                }`}
                                            >
                                                <Text
                                                    className={`text-[10px] font-semibold text-center ${
                                                        appt?.relation_type === 'OTHER' ? 'text-amber-700' : 'text-sky-700'
                                                    }`}
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail"
                                                >
                                                    {badgeText}
                                                </Text>
                                            </View>
                                        );
                                    })()}
                                </View>
                                {(() => {
                                    const appt = latestBookedAppointmentByDoctor.get(item.doctor_id);
                                    const apptNo = getAppointmentNo(appt);
                                    if (!apptNo) return null;
                                    return (
                                        <Text className="text-[10px] font-semibold text-gray-500 mt-1">
                                            Appointment No. {apptNo}
                                        </Text>
                                    );
                                })()}
                                <Text className="text-[10px] text-gray-400 mt-1">Tap to view appointment history</Text>
                            </View>
                            <TouchableOpacity
                            onPress={(e) => {
                                e?.stopPropagation?.();
                                handleOpenDoctorChat(item.doctor_id, item.doctor_name || 'Doctor', item.profile_pic_url);
                            }}
                            className="w-9 h-9 rounded-full bg-blue-50 items-center justify-center relative ml-2"
                        >
                                <MessageCircle size={18} color="#1d4ed8" />
                                {unreadCount > 0 ? (
                                    <View className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center border border-white">
                                        <Text className="text-white text-[10px] font-bold">
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}}
                    ListEmptyComponent={
                        shouldShowSignupOnboarding ? (
                            <View className="items-center mt-10 px-1">
                                <View
                                    className="w-full max-w-[360px] bg-white rounded-3xl px-5 py-6 items-center"
                                    style={{
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 4 },
                                        shadowOpacity: 0.08,
                                        shadowRadius: 10,
                                        elevation: 3,
                                    }}
                                >
                                    <View className="mb-4 items-center justify-center">
                                        <View className="absolute w-20 h-20 rounded-full bg-blue-50" />
                                        <View className="absolute w-12 h-12 rounded-full bg-sky-100 -right-1 top-1" />
                                        <View className="w-14 h-14 rounded-2xl bg-white border border-blue-100 items-center justify-center">
                                            <CalendarDays size={26} color="#2563eb" />
                                        </View>
                                    </View>
                                    <Text className="text-slate-800 text-xl font-bold">No doctors yet</Text>
                                    <Text className="text-slate-500 text-sm text-center leading-5 mt-2 px-2">
                                        Book your first appointment to connect with a doctor.
                                    </Text>

                                    <View className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 mt-5">
                                        <Text className="text-slate-700 text-sm font-semibold">1. Choose doctor</Text>
                                        <Text className="text-slate-700 text-sm font-semibold mt-2">2. Pick clinic and time</Text>
                                        <Text className="text-slate-700 text-sm font-semibold mt-2">3. Your doctor appears here</Text>
                                    </View>

                                    <TouchableOpacity
                                        className="mt-5 w-full rounded-2xl bg-blue-600 py-3.5 items-center justify-center"
                                        activeOpacity={0.85}
                                        onPress={() =>
                                            navigation.navigate('PatientMain', {
                                                screen: 'PatientAppointments',
                                                params: { openCreate: true },
                                            })
                                        }
                                    >
                                        <Text className="text-white font-bold text-base">Book First Appointment</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View className="items-center mt-14">
                                <Text className="text-gray-500">No assigned doctors yet</Text>
                            </View>
                        )
                    }
                />
                <IncomingMessageBubble
                    message={incomingMessage}
                    onPress={(message) => {
                        if (message.isAnnouncement) {
                            clearAnnouncementIndicators();
                            navigation.navigate('PatientAnnouncements' as never);
                            return;
                        }
                        handleOpenDoctorChat(message.doctorId, message.senderName);
                    }}
                />

                <Modal visible={profileCompletionVisible} transparent animationType="fade" onRequestClose={() => undefined}>
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-5 max-h-[88%]">
                            <View className="mb-4">
                                <Text className="text-xs text-blue-500 font-semibold uppercase tracking-wider">Complete Profile</Text>
                                <Text className="text-2xl font-bold text-gray-900 mt-1">
                                    Finish your patient details
                                </Text>
                                <Text className="text-sm text-gray-500 mt-2">
                                    Please complete your profile before continuing.
                                </Text>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false}>
                                {!patient?.age ? (
                                    <View className="mb-4">
                                        <Text className="text-base font-bold text-gray-700 mb-2">Date of Birth</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowDobCalendar(true);
                                                setShowYearPicker(false);
                                            }}
                                            className={`bg-white rounded-2xl px-4 border-2 flex-row items-center justify-between py-4 ${
                                                showDobCalendar ? 'border-blue-500' : 'border-gray-200'
                                            }`}
                                        >
                                            <Text className={`text-base ${completionDob ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                                {completionDob ? formatDob(completionDob) : 'Select date of birth'}
                                            </Text>
                                            <View className="flex-row items-center">
                                                {computedCompletionAge != null ? (
                                                    <Text className="text-blue-600 font-semibold text-sm mr-2">{computedCompletionAge} yrs</Text>
                                                ) : null}
                                                <CalendarDays size={18} color="#2563eb" />
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                        <Text className="text-xs font-semibold uppercase text-emerald-700">Age</Text>
                                        <Text className="text-sm font-medium text-emerald-900 mt-1">
                                            {patient.age} years already on file
                                        </Text>
                                    </View>
                                )}

                                <View className="mb-4">
                                    <Text className="text-base font-bold text-gray-700 mb-2">Gender</Text>
                                    <View className="bg-white rounded-2xl px-4 py-3 border-2 border-gray-200">
                                        <View className="flex-row flex-wrap gap-2">
                                            {GENDER_OPTIONS.map((option) => (
                                                <TouchableOpacity
                                                    key={option}
                                                    onPress={() => setCompletionGender(option)}
                                                    className={`px-3 py-1.5 rounded-full border ${
                                                        completionGender === option ? 'bg-blue-600 border-blue-600' : 'bg-gray-50 border-gray-300'
                                                    }`}
                                                >
                                                    <Text className={`text-xs font-semibold ${completionGender === option ? 'text-white' : 'text-gray-600'}`}>
                                                        {option}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={() => {
                                        void handleCompleteProfile();
                                    }}
                                    disabled={profileCompletionSaving}
                                    className={`rounded-2xl items-center justify-center py-4 ${
                                        profileCompletionSaving ? 'bg-blue-300' : 'bg-blue-600'
                                    }`}
                                >
                                    {profileCompletionSaving ? (
                                        <View className="flex-row items-center">
                                            <ActivityIndicator color="#fff" size="small" />
                                            <Text className="text-white font-bold ml-3 text-base">Saving...</Text>
                                        </View>
                                    ) : (
                                        <Text className="text-white font-extrabold text-base tracking-wide">
                                            Save and Continue
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <Modal
                    visible={showDobCalendar}
                    transparent
                    animationType="slide"
                    onRequestClose={() => {
                        setShowDobCalendar(false);
                        setShowYearPicker(false);
                    }}
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-5 max-h-[78%]">
                            <View className="flex-row items-center justify-between mb-4">
                                <View>
                                    <Text className="text-xs text-gray-400">Select Date of Birth</Text>
                                    <Text className="text-lg font-bold text-gray-800">
                                        {completionDob ? formatDob(completionDob) : 'Choose your birth date'}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => {
                                        setShowDobCalendar(false);
                                        setShowYearPicker(false);
                                    }}
                                    className="bg-gray-100 rounded-full px-3 py-2"
                                >
                                    <Text className="text-gray-600 text-xs font-semibold">Close</Text>
                                </TouchableOpacity>
                            </View>

                            <View>{renderDobCalendar()}</View>
                        </View>
                    </View>
                </Modal>

                <Modal visible={historyVisible} transparent animationType="slide" onRequestClose={() => setHistoryVisible(false)}>
                    <View className="flex-1 justify-end bg-black/40">
                        <View className="bg-white rounded-t-3xl p-5 max-h-[80%]">
                            <View className="flex-row items-center justify-between mb-4">
                            <View>
                                <Text className="text-xs text-gray-400">Appointment History</Text>
                                <Text className="text-lg font-bold text-gray-800">
                                    {formatDoctorName(historyDoctor?.doctor_name)}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setHistoryVisible(false)}
                                className="bg-gray-100 rounded-full px-3 py-2"
                            >
                                <Text className="text-gray-600 text-xs font-semibold">Close</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row flex-wrap mb-4">
                            {([
                                { key: 'TODAY', label: 'Today' },
                                { key: 'TOMORROW', label: 'Tomorrow' },
                                { key: 'UPCOMING', label: 'Upcoming' },
                            ] as Array<{ key: HistoryFilter; label: string }>).map((filterItem) => {
                                const active = historyFilter === filterItem.key;
                                return (
                                    <TouchableOpacity
                                        key={filterItem.key}
                                        onPress={() => setHistoryFilter(filterItem.key)}
                                        className={`mr-2 mb-2 px-3 py-1.5 rounded-full border ${active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-600'}`}>
                                            {filterItem.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View className="h-[238px]">
                            <ScrollView className="h-full" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator>
                                {(() => {
                                    const items = historyDoctor
                                        ? (appointmentsByDoctor.get(historyDoctor.doctor_id) || [])
                                        : [];
                                    const filteredItems = items.filter((apt) => {
                                        const ymd = toYMD(apt.appointment_date);
                                        if (!ymd) return false;
                                        if (historyFilter === 'TODAY') return ymd === todayIST;
                                        if (historyFilter === 'TOMORROW') return ymd === tomorrowIST;
                                        return ymd > tomorrowIST;
                                    });
                                    const sortedItems = [...filteredItems].sort((a, b) => {
                                        const aYmd = toYMD(a.appointment_date);
                                        const aHm = toHM(a.start_time);
                                        const aTs = aYmd && aHm ? new Date(`${aYmd}T${aHm}:00`).getTime() : 0;
                                        const bYmd = toYMD(b.appointment_date);
                                        const bHm = toHM(b.start_time);
                                        const bTs = bYmd && bHm ? new Date(`${bYmd}T${bHm}:00`).getTime() : 0;
                                        return aTs - bTs;
                                    });
                                    if (sortedItems.length === 0) {
                                        return (
                                            <View className="h-[238px] items-center justify-center px-4">
                                                <Text className="text-gray-400">
                                                    {historyFilter === 'TODAY'
                                                        ? 'No appointments for today'
                                                        : historyFilter === 'TOMORROW'
                                                            ? 'No appointments for tomorrow'
                                                            : 'No upcoming appointments found'}
                                                </Text>
                                            </View>
                                        );
                                    }
                                    return sortedItems.map((apt, index) => {
                                        const status = String(apt.status || '').toUpperCase();
                                        const statusLabel =
                                            status === 'PENDING'
                                                ? 'Not Visited'
                                                : status === 'CANCELLED' && apt.cancelled_by
                                                    ? 'Cancelled'
                                                    : status || 'N/A';
                                        const statusClass =
                                            status === 'COMPLETED'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : status === 'CANCELLED'
                                                    ? 'bg-rose-50 text-rose-700'
                                                    : status === 'PENDING'
                                                        ? 'bg-amber-50 text-amber-700'
                                                        : 'bg-blue-50 text-blue-700';
                                        return (
                                            <View
                                                key={`${apt.appointment_id}:${index}`}
                                                className="border border-gray-100 rounded-2xl p-4 mb-3"
                                            >
                                                <View className="flex-row items-center justify-between">
                                                    <Text className="text-gray-800 font-semibold text-sm">
                                                        {apt.clinic?.clinic_name || 'Clinic'}
                                                    </Text>
                                                    <View className={`px-2 py-0.5 rounded-full ${statusClass}`}>
                                                        <Text className="text-[10px] font-semibold">{statusLabel}</Text>
                                                    </View>
                                                </View>
                                                <View className="flex-row mt-2">
                                                    <View className="flex-1">
                                                        <Text className="text-[10px] uppercase text-gray-400">Date</Text>
                                                        <Text className="text-xs text-gray-700 font-semibold">
                                                            {formatDateOnly(apt.appointment_date)}
                                                        </Text>
                                                    </View>
                                                    <View className="flex-1">
                                                        <Text className="text-[10px] uppercase text-gray-400">Time</Text>
                                                        <Text className="text-xs text-gray-700 font-semibold">
                                                            {formatTimeOnly(apt.start_time)}
                                                        </Text>
                                                    </View>
                                                </View>
                                                {hasOtherContext ? (
                                                    <View className={`mt-3 self-start px-2.5 py-1 rounded-full ${apt.relation_type === 'OTHER' ? 'bg-amber-50 border border-amber-200' : 'bg-sky-50 border border-sky-200'}`}>
                                                        <Text className={`text-[10px] font-semibold ${apt.relation_type === 'OTHER' ? 'text-amber-700' : 'text-sky-700'}`}>
                                                            {getRelationBadgeText(apt)}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                        );
                                    });
                                })()}
                            </ScrollView>
                        </View>
                        <View className="h-[72px] mt-3 justify-start">
                            {(() => {
                                const items = historyDoctor
                                    ? (appointmentsByDoctor.get(historyDoctor.doctor_id) || [])
                                    : [];
                                const filteredItems = items.filter((apt) => {
                                    const ymd = toYMD(apt.appointment_date);
                                    if (!ymd) return false;
                                    if (historyFilter === 'TODAY') return ymd === todayIST;
                                    if (historyFilter === 'TOMORROW') return ymd === tomorrowIST;
                                    return ymd > tomorrowIST;
                                });
                                if (filteredItems.length === 0) {
                                    return <View />;
                                }
                                const counts = filteredItems.reduce((acc, apt) => {
                                    const key = String(apt.status || 'BOOKED').toUpperCase();
                                    acc.total += 1;
                                    acc[key] = (acc[key] || 0) + 1;
                                    return acc;
                                }, { total: 0 } as Record<string, number>);
                                const chips = [
                                    { key: 'total', label: 'Total', value: counts.total, tone: 'bg-slate-100 text-slate-700' },
                                    { key: 'BOOKED', label: 'Booked', value: counts.BOOKED || 0, tone: 'bg-blue-50 text-blue-700' },
                                    { key: 'PENDING', label: 'Not Visited', value: counts.PENDING || 0, tone: 'bg-amber-50 text-amber-700' },
                                    { key: 'COMPLETED', label: 'Completed', value: counts.COMPLETED || 0, tone: 'bg-emerald-50 text-emerald-700' },
                                    { key: 'CANCELLED', label: 'Cancelled', value: counts.CANCELLED || 0, tone: 'bg-rose-50 text-rose-700' },
                                ];
                                return (
                                    <View className="flex-row flex-wrap">
                                        {chips.map((chip) => (
                                            <View key={chip.key} className={`mr-2 mb-2 px-3 py-1 rounded-full ${chip.tone}`}>
                                                <Text className="text-[10px] font-semibold">
                                                    {chip.label} {chip.value}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                );
                            })()}
                        </View>
                    </View>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}
