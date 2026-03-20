import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    StatusBar,
    TouchableOpacity,
    Modal,
    ScrollView,
    TextInput,
    Alert,
    RefreshControl,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import {
    Activity,
    X,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Check,
    User,
    Circle,
    EllipsisVertical,
    Search,
    CalendarRange,
    PlusCircle,
    Eraser,
    MessageCircle,
    Download,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from '../api/appointments';
import { getClinics } from '../api/clinics';
import { getAvailableDates, getSlots } from '../api/slots';
import client from '../api/client';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { getChatNotifications, type IncomingNotificationMessage } from '../api/notifications';
import IncomingMessageBubble from '../components/IncomingMessageBubble';
import { io, type Socket } from 'socket.io-client';
import { API_URL, SOCKET_URL } from '../config/env';
import { useAuthSession } from '../context/AuthSessionContext';
import { getToken } from '../api/token';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${MONTH_NAMES[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
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

const pad2 = (value: number) => String(value).padStart(2, '0');
const ymdFromParts = (year: number, month: number, day: number) =>
    `${year}-${pad2(month)}-${pad2(day)}`;
const toYMDUTC = (date: Date) =>
    ymdFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
const getISTTodayYMD = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return toYMDUTC(ist);
};
const addDaysToYMD = (ymd: string, days: number) => {
    const base = new Date(`${ymd}T00:00:00+05:30`);
    const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    const ist = new Date(shifted.getTime() + 5.5 * 60 * 60 * 1000);
    return toYMDUTC(ist);
};

const parseDateOnly = (value?: string) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

const istTimeToDisplay = (value: any): string => {
    if (!value) return 'N/A';
    const t = new Date(value);
    if (Number.isNaN(t.getTime())) return 'N/A';
    const hours = t.getUTCHours();
    const minutes = t.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const istDateToDisplay = (value: any): string => {
    if (!value) return 'N/A';
    const dateStr = String(value).slice(0, 10); // 'YYYY-MM-DD'
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
};

const parseAppointmentStart = (appointment: any): Date | null => {
    const dateStr = appointment?.appointment_date;
    const timeRaw = appointment?.start_time;
    if (!dateStr || !timeRaw) return null;

    // Extract the calendar date (YYYY-MM-DD). If dateStr is an ISO string,
    // take the first 10 chars; otherwise use as-is.
    const datePart = String(dateStr).slice(0, 10); // "2026-02-26"

    const timeDate = new Date(timeRaw);
    if (Number.isNaN(timeDate.getTime())) return null;
    const hh = String(timeDate.getUTCHours()).padStart(2, '0');
    const mm = String(timeDate.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    const result = new Date(`${datePart}T${timeStr}:00+05:30`);
    return Number.isNaN(result.getTime()) ? null : result;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string; dotColor: string }> = {
    booked: { dot: 'bg-indigo-500', badge: 'bg-indigo-100', label: 'text-indigo-700', dotColor: '#4338ca' },
    confirmed: { dot: 'bg-green-500', badge: 'bg-green-100', label: 'text-green-700', dotColor: '#15803d' },
    pending: { dot: 'bg-yellow-500', badge: 'bg-yellow-100', label: 'text-yellow-700', dotColor: '#a16207' },
    cancelled: { dot: 'bg-red-500', badge: 'bg-red-100', label: 'text-red-600', dotColor: '#dc2626' },
    completed: { dot: 'bg-green-500', badge: 'bg-green-100', label: 'text-green-700', dotColor: '#15803d' },
};

const getStatusLabel = (status: string, cancelledBy?: string | null) => {
    const statusUpper = String(status || '').toUpperCase();
    if (statusUpper === 'COMPLETED') return 'Visited';
    if (statusUpper === 'PENDING') return 'Not Visited';
    if (statusUpper === 'CANCELLED') {
        const by = String(cancelledBy || '').toUpperCase();
        if (by === 'DOCTOR') return 'Cancelled by doctor';
        if (by === 'PATIENT') return 'Cancelled by patient';
        return 'Cancelled';
    }
    return status || 'Unknown';
};

const StatusBadge = ({ status, cancelledBy }: { status: string; cancelledBy?: string | null }) => {
    const s = STATUS_CONFIG[status?.toLowerCase()] ?? {
        dot: 'bg-gray-400', badge: 'bg-gray-100', label: 'text-gray-600', dotColor: '#4b5563',
    };
    const statusText = getStatusLabel(status, cancelledBy);
    return (
        <View className={`self-start flex-row items-center px-2 py-1 rounded-full ${s.badge}`}>
            <Circle size={8} color={s.dotColor} fill={s.dotColor} style={{ marginRight: 6 }} />
            <Text className={`text-xs font-bold ${s.label}`}>{statusText}</Text>
        </View>
    );
};

// ─── Clinic Dropdown ──────────────────────────────────────────────────────────

interface ClinicDropdownProps {
    clinics: any[];
    selectedId: string;
    onSelect: (id: string) => void;
}

type BookingFor = 'SELF' | 'OTHER';

interface MatchedPatient {
    patient_id: number;
    full_name: string | null;
}

const ClinicDropdown = ({ clinics, selectedId, onSelect }: ClinicDropdownProps) => {
    const [open, setOpen] = useState(false);
    const selectedClinic = clinics.find(c => c.clinic_id.toString() === selectedId);

    return (
        // zIndex must stay inline — NativeWind doesn't support dynamic z-index
        <View style={{ zIndex: 100 }}>
            {/* Trigger */}
            <TouchableOpacity
                onPress={() => setOpen(prev => !prev)}
                className={`bg-gray-50 border border-gray-200 px-4 py-3.5 flex-row items-center justify-between
                    ${open ? 'rounded-t-xl border-blue-500' : 'rounded-xl'}`}
            >
                <Text className={`text-base ${selectedClinic ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                    {selectedClinic ? selectedClinic.clinic_name : 'Select a clinic'}
                </Text>
                {/* rotate must stay inline — Animated/style transform */}
                <ChevronDown
                    size={18}
                    color="#9ca3af"
                    style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                />
            </TouchableOpacity>

            {/* Dropdown list */}
            {open && (
                <View className="bg-white border border-t-0 border-gray-200 rounded-b-xl overflow-hidden shadow-md elevation-6">
                    {clinics.map((c, i) => {
                        const isSelected = c.clinic_id.toString() === selectedId;
                        return (
                            <TouchableOpacity
                                key={c.clinic_id}
                                onPress={() => { onSelect(c.clinic_id.toString()); setOpen(false); }}
                                className={`px-4 py-3.5 flex-row items-center justify-between
                                    ${isSelected ? 'bg-blue-50' : 'bg-white'}
                                    ${i < clinics.length - 1 ? 'border-b border-gray-100' : ''}`}
                            >
                                <Text className={`text-base ${isSelected ? 'text-blue-700 font-bold' : 'text-gray-700'}`}>
                                    {c.clinic_name}
                                </Text>
                                {isSelected && <Check size={16} color="#2563eb" />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

// ─── Calendar Picker ──────────────────────────────────────────────────────────

interface CalendarPickerProps {
    selectedDate: string;
    onSelect: (date: string) => void;
    minDate?: string;
    enabledDates?: Set<string>;
    loadingDates?: boolean;
}

const CalendarPicker = ({ selectedDate, onSelect, minDate, enabledDates, loadingDates = false }: CalendarPickerProps) => {
    const todayYMD = getISTTodayYMD();
    const [initYear, initMonth] = (() => {
        if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
            const [y, m] = selectedDate.split('-').map(Number);
            return [y || Number(todayYMD.slice(0, 4)), (m || 1) - 1];
        }
        return [Number(todayYMD.slice(0, 4)), Number(todayYMD.slice(5, 7)) - 1];
    })();

    const [viewYear, setViewYear] = useState(initYear);
    const [viewMonth, setViewMonth] = useState(initMonth);

    const minDateStr = minDate && /^\d{4}-\d{2}-\d{2}$/.test(minDate) ? minDate : todayYMD;

    // Sunday=0 ... Saturday=6
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <View className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm elevation-3">

            {/* Month navigation */}
            <View className="flex-row items-center justify-between px-4 py-3 bg-blue-600 rounded-t-2xl">
                <TouchableOpacity onPress={prevMonth} className="p-1">
                    <ChevronLeft size={20} color="white" />
                </TouchableOpacity>
                <Text className="text-white font-bold text-base">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} className="p-1">
                    <ChevronRight size={20} color="white" />
                </TouchableOpacity>
            </View>

            {/* Day labels */}
            <View className="flex-row bg-blue-50 px-2 py-2">
                {DAY_LABELS.map(d => (
                    <View key={d} className="flex-1 items-center">
                        <Text className="text-blue-400 text-xs font-bold">{d}</Text>
                    </View>
                ))}
            </View>

            {/* Date grid */}
            <View className="px-2 pb-3 pt-1">
                {loadingDates ? (
                    <View className="items-center py-6">
                        <ActivityIndicator size="small" color="#2563eb" />
                        <Text className="text-xs text-gray-400 mt-2">Loading available dates...</Text>
                    </View>
                ) : Array.from({ length: cells.length / 7 }, (_, row) => (
                    <View key={row} className="flex-row">
                        {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                            if (!day) return <View key={col} className="flex-1 m-1" />;

                            const dateStr = ymdFromParts(viewYear, viewMonth + 1, day);
                            const isSelected = dateStr === selectedDate;
                            const isToday = dateStr === todayYMD;
                            const isEnabledDate = enabledDates ? enabledDates.has(dateStr) : true;
                            const isDisabled = dateStr < minDateStr || !isEnabledDate;

                            // Dynamic bg can't be expressed as static NativeWind class — keep inline
                            const bgColor = isSelected ? '#2563eb' : isToday ? '#dbeafe' : 'transparent';
                            const textColor = isSelected ? '#fff' : isToday ? '#1d4ed8' : isDisabled ? '#9ca3af' : '#374151';

                            return (
                                <TouchableOpacity
                                    key={col}
                                    onPress={() => !isDisabled && onSelect(dateStr)}
                                    disabled={isDisabled}
                                    className={`flex-1 m-1 h-9 items-center justify-center rounded-xl
                                        ${isDisabled ? 'opacity-30' : 'opacity-100'}`}
                                    style={{ backgroundColor: bgColor }}
                                >
                                    <Text className="text-sm font-semibold" style={{ color: textColor }}>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

const AppointmentsScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { role, staff_role, staff_doctor_id } = useAuthSession();
    const isClinicStaff = role === 'CLINIC_STAFF';
    const isViewerStaff = isClinicStaff && String(staff_role || '').toUpperCase() === 'VIEWER';
    const canUseChat = role === 'DOCTOR';
    const canManageAppointments = role === 'DOCTOR' || (isClinicStaff && !isViewerStaff);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchAppointments(), fetchClinicsData()]);
        setRefreshing(false);
    };

    const [formData, setFormData] = useState({
        patient_phone: '',
        patient_name: '',
        booking_for: 'SELF' as BookingFor,
        clinic_id: '',
        date: '',
        time: '',
    });

    const [clinics, setClinics] = useState<any[]>([]);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
    const [slotDuration, setSlotDuration] = useState(30);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [loadingDates, setLoadingDates] = useState(false);
    const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
    const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleStart, setRescheduleStart] = useState('');
    const [rescheduleEnd, setRescheduleEnd] = useState('');
    const [rescheduleClinicId, setRescheduleClinicId] = useState('');
    const [rescheduleDoctorId, setRescheduleDoctorId] = useState<number>(0);
    const [rescheduleAvailableDates, setRescheduleAvailableDates] = useState<Set<string>>(new Set());
    const [rescheduleAvailableSlots, setRescheduleAvailableSlots] = useState<string[]>([]);
    const [rescheduleSlotDuration, setRescheduleSlotDuration] = useState(30);
    const [rescheduleLoadingDates, setRescheduleLoadingDates] = useState(false);
    const [rescheduleLoadingSlots, setRescheduleLoadingSlots] = useState(false);
    const [showRescheduleCalendar, setShowRescheduleCalendar] = useState(false);
    const [incomingMessage, setIncomingMessage] = useState<IncomingNotificationMessage | null>(null);
    const lastNotifCheckAtRef = useRef(new Date(Date.now() - 2 * 60 * 1000).toISOString());
    const bubbleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const socketEnabled = useMemo(() => !SOCKET_URL.includes('vercel.app'), []);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<TextInput>(null);
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showQuickDatePicker, setShowQuickDatePicker] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'BOOKED' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('ALL');
    const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [exportPreset, setExportPreset] = useState<'ONE_DAY' | 'ONE_WEEK' | 'ONE_MONTH' | 'CUSTOM'>('ONE_DAY');
    const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf');
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [exportCalendarMode, setExportCalendarMode] = useState<'FROM' | 'TO' | null>(null);
    const [openCardMenuId, setOpenCardMenuId] = useState<number | null>(null);
    const [highlightedPairKey, setHighlightedPairKey] = useState<string | null>(null);
    const handledPrefillKeyRef = useRef<string>('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [matchedPatients, setMatchedPatients] = useState<MatchedPatient[]>([]);

    useEffect(() => {
        fetchAppointments();
        fetchClinicsData();
    }, []);

    useEffect(() => {
        const params = route?.params || {};
        if (!params?.openCreate) return;
        if (!canManageAppointments) {
            Alert.alert('View only', 'You have view-only access for appointments.');
            return;
        }
        const prefillKey = String(params.prefillKey || `${params.prefillPatientPhone || ''}:${params.prefillPatientName || ''}`);
        if (handledPrefillKeyRef.current === prefillKey) return;
        handledPrefillKeyRef.current = prefillKey;

        setFormData((prev) => ({
            ...prev,
            patient_phone: params.prefillPatientPhone || '',
            patient_name: params.prefillPatientName || '',
            booking_for: 'SELF',
            clinic_id: prev.clinic_id || (clinics[0]?.clinic_id ? String(clinics[0].clinic_id) : ''),
            date: '',
            time: '',
        }));
        setShowCalendar(false);
        setModalVisible(true);
        setHeaderMenuVisible(false);
    }, [canManageAppointments, route?.params, clinics]);

    const checkIncomingNotifications = React.useCallback(async () => {
        if (!canUseChat) return;
        try {
            const data = await getChatNotifications(lastNotifCheckAtRef.current);
            lastNotifCheckAtRef.current = new Date().toISOString();
            if (data?.latestMessage) {
                setIncomingMessage(data.latestMessage);
                if (bubbleHideTimerRef.current) {
                    clearTimeout(bubbleHideTimerRef.current);
                }
                bubbleHideTimerRef.current = setTimeout(() => {
                    setIncomingMessage(null);
                }, 5000);
            }
        } catch {
            // ignore periodic notification errors
        }
    }, [canUseChat]);

    useEffect(() => {
        if (!canUseChat) {
            setIncomingMessage(null);
            setHighlightedPairKey(null);
            return;
        }
        checkIncomingNotifications();
        const interval = setInterval(checkIncomingNotifications, 7000);
        return () => {
            clearInterval(interval);
            if (bubbleHideTimerRef.current) {
                clearTimeout(bubbleHideTimerRef.current);
            }
            if (highlightHideTimerRef.current) {
                clearTimeout(highlightHideTimerRef.current);
            }
        };
    }, [canUseChat, checkIncomingNotifications]);

    useFocusEffect(
        React.useCallback(() => {
            if (!canUseChat) return;
            checkIncomingNotifications();
        }, [canUseChat, checkIncomingNotifications])
    );

    useEffect(() => {
        if (!canUseChat) return;
        if (!socketEnabled) return;
        if (appointments.length === 0) return;
        const pairs = Array.from(
            new Map(
                appointments
                    .filter((a) => a?.patient_id && a?.doctor_id)
                    .map((a) => [`${a.patient_id}:${a.doctor_id}`, { patientId: a.patient_id, doctorId: a.doctor_id, patientName: a?.patient?.full_name || 'Patient' }])
            ).values()
        );
        if (pairs.length === 0) return;

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;

        const joinAllRooms = () => {
            pairs.forEach((p) => socket.emit('join_chat', { patientId: p.patientId, doctorId: p.doctorId }));
        };
        socket.on('connect', joinAllRooms);
        socket.on('receive_message', (msg: any) => {
            if (!msg || msg.sender !== 'PATIENT') return;
            const sender = pairs.find((p) => p.patientId === msg.patient_id && p.doctorId === msg.doctor_id);
            if (!sender) return;
            const pairKey = `${msg.patient_id}:${msg.doctor_id}`;
            setHighlightedPairKey(pairKey);
            if (highlightHideTimerRef.current) {
                clearTimeout(highlightHideTimerRef.current);
            }
            highlightHideTimerRef.current = setTimeout(() => {
                setHighlightedPairKey((prev) => (prev === pairKey ? null : prev));
            }, 12000);
            setIncomingMessage({
                senderName: sender.patientName,
                senderRole: 'PATIENT',
                preview: msg.content || '',
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
            if (highlightHideTimerRef.current) {
                clearTimeout(highlightHideTimerRef.current);
            }
        };
    }, [appointments, canUseChat, socketEnabled]);

    useEffect(() => {
        if (formData.clinic_id && formData.date) fetchSlotsData();
        else setAvailableSlots([]);
    }, [formData.clinic_id, formData.date]);

    useEffect(() => {
        if (!rescheduleModalVisible || !rescheduleClinicId || !rescheduleDoctorId) {
            setRescheduleAvailableDates(new Set());
            return;
        }
        setRescheduleLoadingDates(true);
        getAvailableDates(rescheduleDoctorId, Number(rescheduleClinicId))
            .then((dates) => {
                const next = new Set(dates);
                setRescheduleAvailableDates(next);
                setRescheduleDate((prev) => (prev && next.has(prev) ? prev : prev));
            })
            .catch(() => setRescheduleAvailableDates(new Set()))
            .finally(() => setRescheduleLoadingDates(false));
    }, [rescheduleModalVisible, rescheduleClinicId, rescheduleDoctorId]);

    useEffect(() => {
        if (!rescheduleModalVisible || !rescheduleClinicId || !rescheduleDate) {
            setRescheduleAvailableSlots([]);
            return;
        }
        setRescheduleLoadingSlots(true);
        getSlots(rescheduleDate, Number(rescheduleClinicId), rescheduleDoctorId || undefined)
            .then((data) => {
                setRescheduleAvailableSlots(data.slots || []);
                if (data.slot_duration) setRescheduleSlotDuration(data.slot_duration);
            })
            .catch(() => setRescheduleAvailableSlots([]))
            .finally(() => setRescheduleLoadingSlots(false));
    }, [rescheduleModalVisible, rescheduleClinicId, rescheduleDoctorId, rescheduleDate]);

    const selectedClinic = useMemo(
        () => clinics.find((clinic) => String(clinic.clinic_id) === String(formData.clinic_id)),
        [clinics, formData.clinic_id]
    );

    useEffect(() => {
        const resolvedDoctorId = Number(selectedClinic?.doctor_id || staff_doctor_id || 0);
        if (!formData.clinic_id || !resolvedDoctorId) {
            setAvailableDates(new Set());
            setLoadingDates(false);
            return;
        }

        setLoadingDates(true);
        getAvailableDates(resolvedDoctorId, Number(formData.clinic_id))
            .then((dates) => {
                const nextDates = new Set(dates);
                setAvailableDates(nextDates);
                setFormData((prev) => {
                    if (!prev.date || nextDates.has(prev.date)) return prev;
                    return { ...prev, date: '', time: '' };
                });
            })
            .catch(() => {
                setAvailableDates(new Set());
            })
            .finally(() => setLoadingDates(false));
    }, [formData.clinic_id, selectedClinic?.doctor_id, staff_doctor_id]);

    useEffect(() => {
        if (!isModalVisible) {
            setMatchedPatients([]);
            setLookupLoading(false);
            return;
        }

        const phone = String(formData.patient_phone || '').trim();
        if (phone.length < 8) {
            setMatchedPatients([]);
            setLookupLoading(false);
            return;
        }

        const timer = setTimeout(async () => {
            setLookupLoading(true);
            try {
                const response = await client.get(`/patients/lookup?phone=${encodeURIComponent(phone)}`);
                setMatchedPatients(response.data?.patients || []);
            } catch (error) {
                setMatchedPatients([]);
            } finally {
                setLookupLoading(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [formData.patient_phone, isModalVisible]);

    useEffect(() => {
        if (!showSearch) return;
        const timer = setTimeout(() => {
            searchInputRef.current?.focus();
        }, 120);
        return () => clearTimeout(timer);
    }, [showSearch]);

    const fetchAppointments = async () => {
        try {
            const data = await getAppointments();
            setAppointments(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getExportRange = () => {
        const today = getISTTodayYMD();
        if (exportPreset === 'ONE_DAY') {
            return { from: today, to: today };
        }
        if (exportPreset === 'ONE_WEEK') {
            return { from: addDaysToYMD(today, -6), to: today };
        }
        if (exportPreset === 'ONE_MONTH') {
            return { from: addDaysToYMD(today, -29), to: today };
        }
        const from = exportFrom;
        const to = exportTo || exportFrom;
        return { from, to };
    };

    const handleExportDownload = async () => {
        setExportError('');
        if (exportPreset === 'CUSTOM' && !exportFrom) {
            setExportError('Please select a From date.');
            return;
        }
        if (exportPreset === 'CUSTOM' && exportTo && exportTo < exportFrom) {
            setExportError('To date cannot be earlier than From date.');
            return;
        }
        const { from, to } = getExportRange();
        if (!from || !to) {
            setExportError('Please choose a valid date range.');
            return;
        }

        setExporting(true);
        try {
            const token = await getToken();
            if (!token) {
                setExportError('Unauthorized. Please log in again.');
                return;
            }

            const format = exportFormat;
            const ext = format === 'excel' ? 'xlsx' : 'pdf';
            const filename = `appointments_${from.replaceAll('-', '')}_${to.replaceAll('-', '')}.${ext}`;
            const url = `${API_URL}/appointments/export?dateFrom=${from}&dateTo=${to}&format=${format}`;

            if (Platform.OS === 'web') {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    setExportError(`Failed to download export (status ${res.status}).`);
                    return;
                }
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(blobUrl);
            } else {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    setExportError(`Failed to download export (status ${res.status}). ${body}`.trim());
                    return;
                }
                const arrayBuffer = await res.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');

                if (Platform.OS === 'android') {
                    const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                    if (!perm.granted) {
                        Alert.alert('Permission needed', 'Allow folder access to save the file.');
                        return;
                    }
                    const mimeType =
                        format === 'excel'
                            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                            : 'application/pdf';
                    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                        perm.directoryUri,
                        filename,
                        mimeType
                    );
                    await FileSystem.writeAsStringAsync(fileUri, base64, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    Alert.alert('Downloaded', 'Saved to selected folder.');
                } else {
                    const fileUri = `${FileSystem.documentDirectory}${filename}`;
                    await FileSystem.writeAsStringAsync(fileUri, base64, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    Alert.alert('Downloaded', `Saved in app files: ${fileUri}`);
                }
            }

            setExportModalVisible(false);
        } catch (e) {
            setExportError('Failed to download export.');
        } finally {
            setExporting(false);
        }
    };

    const fetchClinicsData = async () => {
        try {
            const data = await getClinics();
            setClinics(data.clinics || []);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSlotsData = async () => {
        setLoadingSlots(true);
        try {
            const data = await getSlots(formData.date, parseInt(formData.clinic_id));
            setAvailableSlots(data.slots || []);
            if (data.slot_duration) setSlotDuration(data.slot_duration);
        } catch (e) {
            console.error(e);
            setAvailableSlots([]);
        } finally {
            setLoadingSlots(false);
        }
    };

    const resetForm = () => {
        setFormData({ patient_phone: '', patient_name: '', booking_for: 'SELF', clinic_id: '', date: '', time: '' });
        setAvailableSlots([]);
        setAvailableDates(new Set());
        setShowCalendar(false);
        setMatchedPatients([]);
        setLookupLoading(false);
    };

    const showPermissionDenied = useCallback(() => {
        Alert.alert('View only', 'You have view-only access for appointments.');
    }, []);

    const getApiErrorMessage = useCallback((error: any, fallbackMessage: string) => {
        if (error?.response?.status === 403) {
            return 'You do not have permission to perform this action.';
        }
        return error?.response?.data?.error || fallbackMessage;
    }, []);

    const handleCreateAppointment = async () => {
        if (!canManageAppointments) {
            showPermissionDenied();
            return;
        }
        if (!formData.patient_phone || !formData.patient_name || !formData.clinic_id || !formData.date || !formData.time) {
            Alert.alert('Error', 'Please fill all required fields');
            return;
        }
        setSubmitting(true);
        try {
            const [sh, sm] = formData.time.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(sh, sm, 0, 0);
            const endDate = new Date(startDate.getTime() + slotDuration * 60000);
            const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

            await createAppointment({
                patient_phone: formData.patient_phone,
                patient_name: formData.patient_name,
                booking_for: formData.booking_for,
                clinic_id: formData.clinic_id,
                appointment_date: formData.date,
                start_time: formData.time,
                end_time: endTime,
            });

            Alert.alert('Success', 'Appointment created successfully');
            setModalVisible(false);
            resetForm();
            fetchAppointments();
        } catch (e: any) {
            Alert.alert('Error', getApiErrorMessage(e, 'Failed to create appointment'));
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const toDateInput = (value: string) => {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        // Use IST-aware date string (toISOString gives UTC date, which can be yesterday in IST)
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    };

    const toTimeInput = (value: string) => {
        if (!value) return '';
        if (value.includes(':') && value.length <= 5) return value;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const handleStatusChange = async (appointmentId: number, status: 'CANCELLED' | 'COMPLETED' | 'PENDING') => {
        if (!canManageAppointments) {
            showPermissionDenied();
            return;
        }
        try {
            const extra = status === 'CANCELLED' ? { cancelled_by: 'DOCTOR' } : {};
            await updateAppointment({ appointmentId, status, ...extra });
            setAppointments((prev) => prev.map((a) => a.appointment_id === appointmentId ? { ...a, status, ...extra } : a));
        } catch (error: any) {
            console.error(error);
            Alert.alert('Error', getApiErrorMessage(error, 'Failed to update appointment'));
        }
    };

    const confirmStatusChange = (appointmentId: number, status: 'CANCELLED' | 'COMPLETED' | 'PENDING') => {
        const actionTitle = status === 'CANCELLED'
            ? 'Cancel'
            : status === 'COMPLETED'
                ? 'Mark Visited'
                : 'Mark Not Visited';
        const actionLabel = status === 'CANCELLED'
            ? 'cancel'
            : status === 'COMPLETED'
                ? 'mark as visited'
                : 'mark as not visited';
        Alert.alert(
            `${actionTitle} appointment`,
            `Are you sure you want to ${actionLabel} this appointment?`,
            [
                { text: 'No', style: 'cancel' },
                { text: 'Yes', onPress: () => handleStatusChange(appointmentId, status) },
            ]
        );
    };

    const handleDeleteAppointment = async (appointmentId: number) => {
        if (!canManageAppointments) {
            showPermissionDenied();
            return;
        }
        Alert.alert('Delete appointment', 'Are you sure?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteAppointment(appointmentId);
                        setAppointments((prev) => prev.filter((a) => a.appointment_id !== appointmentId));
                    } catch (error: any) {
                        console.error(error);
                        Alert.alert('Error', getApiErrorMessage(error, 'Failed to delete appointment'));
                    }
                }
            }
        ]);
    };

    const openReschedule = (item: any) => {
        if (!canManageAppointments) {
            showPermissionDenied();
            return;
        }
        setEditingAppointmentId(item.appointment_id);
        setRescheduleDate(toDateInput(item.appointment_date));
        setRescheduleStart(toTimeInput(item.start_time));
        setRescheduleEnd(toTimeInput(item.end_time));
        const clinicId = item?.clinic_id || item?.clinic?.clinic_id || '';
        const doctorId = item?.doctor_id || item?.doctor?.doctor_id || staff_doctor_id || 0;
        setRescheduleClinicId(clinicId ? String(clinicId) : '');
        setRescheduleDoctorId(Number(doctorId) || 0);
        setShowRescheduleCalendar(false);
        setRescheduleModalVisible(true);
    };

    const handleReschedule = async () => {
        if (!canManageAppointments) {
            showPermissionDenied();
            return;
        }
        if (!editingAppointmentId || !rescheduleDate || !rescheduleStart) {
            Alert.alert('Error', 'Please select a date and slot');
            return;
        }
        const [sh, sm] = rescheduleStart.split(':').map(Number);
        const startDate = new Date(Date.UTC(1970, 0, 1, sh || 0, sm || 0, 0, 0));
        const endDate = new Date(startDate.getTime() + rescheduleSlotDuration * 60000);
        const endTime = `${pad2(endDate.getUTCHours())}:${pad2(endDate.getUTCMinutes())}`;
        setRescheduleEnd(endTime);
        Alert.alert('Confirm reschedule', 'Apply this new date and time?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes',
                onPress: async () => {
                    try {
                        await updateAppointment({
                            appointmentId: editingAppointmentId,
                            appointment_date: rescheduleDate,
                            start_time: rescheduleStart,
                            end_time: endTime,
                            status: 'BOOKED',
                        });
                        setAppointments((prev) =>
                            prev.map((a) =>
                                a.appointment_id === editingAppointmentId
                                    ? { ...a, appointment_date: rescheduleDate, start_time: rescheduleStart, end_time: endTime, status: 'BOOKED' }
                                    : a
                            )
                        );
                        setRescheduleModalVisible(false);
                        setEditingAppointmentId(null);
                        setRescheduleAvailableSlots([]);
                    } catch (error: any) {
                        console.error(error);
                        Alert.alert('Error', getApiErrorMessage(error, 'Failed to reschedule appointment'));
                    }
                }
            }
        ]);
    };

    const filteredAppointments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const from = parseDateOnly(dateFrom);
        const to = parseDateOnly(dateTo);

        return appointments.filter((a) => {
            const statusUpper = String(a?.status || '').toUpperCase();
            if (statusFilter !== 'ALL' && statusUpper !== statusFilter) return false;

            const patientName = String(a?.patient?.full_name || '').toLowerCase();
            const phone = String(a?.patient?.phone || '').toLowerCase();
            const bookingId = String(a?.patient?.booking_id || '');
            const clinic = String(a?.clinic?.clinic_name || '').toLowerCase();
            const matchesSearch = !query || patientName.includes(query) || phone.includes(query) || bookingId.includes(query) || clinic.includes(query);
            if (!matchesSearch) return false;

            if (!from && !to) return true;
            const date = parseDateOnly(a?.appointment_date);
            if (!date) return false;
            if (from && date < from) return false;
            if (to && date > to) return false;
            return true;
        });
    }, [appointments, dateFrom, dateTo, searchQuery, statusFilter]);

    const renderItem = useCallback(({ item }: { item: any }) => {
        const statusUpper = String(item?.status || '').toUpperCase();
        const canUpdate = canManageAppointments && statusUpper !== 'COMPLETED' && statusUpper !== 'CANCELLED' && statusUpper !== 'PENDING';
        const isMenuOpen = openCardMenuId === item.appointment_id;
        const pairKey = `${item.patient_id}:${item.doctor_id}`;
        const isHighlighted = highlightedPairKey === pairKey;
        const slotDate = istDateToDisplay(item.appointment_date);
        const slotTime = istTimeToDisplay(item.start_time);

        return (
            <View
                className={`rounded-2xl mb-3 px-3.5 py-3 ${isHighlighted ? 'bg-blue-50 border-2 border-blue-400' : 'bg-white border border-gray-100'}`}
                style={isHighlighted ? { shadowColor: '#2563eb', shadowOpacity: 0.18, shadowRadius: 10, elevation: 4 } : undefined}
            >
                <TouchableOpacity
                    onPress={() => {
                        if (isMenuOpen) {
                            setOpenCardMenuId(null);
                            return;
                        }
                        if (isHighlighted) setHighlightedPairKey(null);
                        if (!canUseChat) return;
                        navigation.navigate('Chat', { patientId: item.patient_id, doctorId: item.doctor_id, patientName: item.patient?.full_name || 'Unknown Patient' });
                    }}
                    activeOpacity={canUseChat ? 0.7 : 1}
                >
                    <View className="flex-row items-start">
                        <View className="bg-blue-100 w-10 h-10 rounded-xl items-center justify-center mr-3 relative">
                            <User size={16} color="#1d4ed8" />
                            {canUseChat && incomingMessage && !incomingMessage.isAnnouncement && incomingMessage.patientId === item.patient_id && incomingMessage.doctorId === item.doctor_id ? (
                                <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 items-center justify-center border border-white">
                                    <Text className="text-white text-[10px] font-bold">1</Text>
                                </View>
                            ) : null}
                        </View>
                        <View className="flex-1">
                            <Text className="text-gray-900 font-bold text-sm" numberOfLines={1}>
                                {item.patient?.full_name || 'Unknown Patient'}
                            </Text>
                            <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                                {item.clinic?.clinic_name || 'N/A'}
                            </Text>
                            <View className="mt-1.5 self-start px-2 py-1 rounded-md bg-gray-100">
                                <Text className="text-[10px] font-semibold text-gray-600">Appointment No. {item.patient?.booking_id ?? item.appointment_id}</Text>
                            </View>
                            {canUseChat && isHighlighted && (
                                <View className="mt-1.5 self-start px-2 py-1 rounded-md bg-blue-600">
                                    <Text className="text-[10px] font-semibold text-white">New message</Text>
                                </View>
                            )}
                        </View>
                        <View className="items-end ml-2">
                            <StatusBadge status={item.status} cancelledBy={item.cancelled_by} />
                            {canManageAppointments ? (
                                <TouchableOpacity
                                    onPress={() => setOpenCardMenuId((prev) => (prev === item.appointment_id ? null : item.appointment_id))}
                                    className="mt-2 p-1.5 rounded-lg bg-gray-100"
                                >
                                    {isMenuOpen ? <X size={14} color="#4b5563" /> : <EllipsisVertical size={14} color="#4b5563" />}
                                </TouchableOpacity>
                            ) : (
                                <View className="mt-2 px-2.5 py-1 rounded-lg bg-gray-100">
                                    <Text className="text-[10px] font-semibold text-gray-500">View only</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View className="mt-3 flex-row">
                        <View className="flex-1 bg-blue-50 rounded-xl px-3 py-2 mr-2">
                            <Text className="text-[10px] uppercase tracking-wide text-blue-500 font-bold">Date</Text>
                            <Text className="text-xs font-semibold text-blue-900 mt-0.5">{slotDate}</Text>
                        </View>
                        <View className="flex-1 bg-emerald-50 rounded-xl px-3 py-2 ml-2">
                            <Text className="text-[10px] uppercase tracking-wide text-emerald-600 font-bold">Time</Text>
                            <Text className="text-xs font-semibold text-emerald-900 mt-0.5">{slotTime}</Text>
                        </View>
                    </View>
                    {canUpdate && (
                        <View className="mt-3 flex-row" style={{ gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => confirmStatusChange(item.appointment_id, 'PENDING')}
                                className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 items-center"
                            >
                                <Text className="text-amber-800 text-xs font-bold">Not Visited</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => confirmStatusChange(item.appointment_id, 'COMPLETED')}
                                className="flex-1 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 items-center"
                            >
                                <Text className="text-green-800 text-xs font-bold">Visited</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {canUseChat && (
                        <View className="mt-3 flex-row justify-end">
                            <View className="px-3 py-2 rounded-lg bg-blue-600 flex-row items-center">
                                <MessageCircle size={12} color="#fff" />
                                <Text className="text-white text-xs font-semibold ml-1.5">Open Chat</Text>
                            </View>
                        </View>
                    )}
                </TouchableOpacity>

                {isMenuOpen && (
                    <View
                        className="absolute top-12 right-3 w-52 bg-white rounded-xl border border-gray-200 overflow-hidden"
                        style={{ zIndex: 60, elevation: 10 }}
                    >
                        {canUseChat && (
                            <TouchableOpacity
                                onPress={() => {
                                    setOpenCardMenuId(null);
                                    navigation.navigate('Chat', {
                                        patientId: item.patient_id,
                                        doctorId: item.doctor_id,
                                        patientName: item.patient?.full_name || 'Unknown Patient'
                                    });
                                }}
                                className="px-4 py-3 border-b border-gray-100"
                            >
                                <Text className="text-sm text-gray-800 font-medium">Open Chat</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            disabled={!canUpdate}
                            onPress={() => {
                                if (!canUpdate) return;
                                setOpenCardMenuId(null);
                                openReschedule(item);
                            }}
                            className="px-4 py-3 border-b border-gray-100"
                        >
                            <Text className={`text-sm font-medium ${canUpdate ? 'text-gray-800' : 'text-gray-400'}`}>Reschedule appointment</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!canUpdate}
                            onPress={() => {
                                if (!canUpdate) return;
                                setOpenCardMenuId(null);
                                confirmStatusChange(item.appointment_id, 'CANCELLED');
                            }}
                            className="px-4 py-3 border-b border-gray-100"
                        >
                            <Text className={`text-sm font-medium ${canUpdate ? 'text-red-600' : 'text-gray-400'}`}>Cancel appointment</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => {
                                setOpenCardMenuId(null);
                                handleDeleteAppointment(item.appointment_id);
                            }}
                            className="px-4 py-3 border-b border-gray-100"
                        >
                            <Text className="text-sm text-red-600 font-medium">Delete</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setOpenCardMenuId(null)}
                            className="px-4 py-3"
                        >
                            <Text className="text-sm text-gray-700 font-medium">Close</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    }, [canManageAppointments, canUseChat, confirmStatusChange, handleDeleteAppointment, highlightedPairKey, navigation, openCardMenuId, openReschedule]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading appointments...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-blue-800" edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <View className="flex-1 bg-gray-50">

                {/* Header */}
                <View className="bg-blue-700 px-5 pt-6 pb-8 rounded-b-3xl relative">
                    <View className="flex-row justify-between items-center">
                        <View>
                            <Text className="text-white text-2xl font-bold">Appointments</Text>
                            {isViewerStaff && (
                                <View className="self-start mt-2 bg-white/15 border border-white/20 rounded-full px-3 py-1">
                                    <Text className="text-white text-xs font-bold">View only</Text>
                                </View>
                            )}
                            <Text className="text-blue-200 text-sm mt-1">
                                {filteredAppointments.length} shown • {appointments.length} total
                            </Text>
                        </View>
                        <View className="flex-row items-center">
                            <TouchableOpacity
                                onPress={() => {
                                    setShowSearch((prev) => !prev);
                                    setHeaderMenuVisible(false);
                                }}
                                className="bg-white p-3 rounded-full mr-2"
                            >
                                <Search size={20} color="#1d4ed8" />
                            </TouchableOpacity>
                            {canManageAppointments && (
                                <TouchableOpacity
                                    onPress={() => {
                                        setModalVisible(true);
                                        setHeaderMenuVisible(false);
                                    }}
                                    className="bg-white p-3 rounded-full mr-2"
                                >
                                    <PlusCircle size={20} color="#1d4ed8" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={() => setHeaderMenuVisible((prev) => !prev)}
                                className="bg-white p-3 rounded-full"
                            >
                                {headerMenuVisible ? <X size={22} color="#1d4ed8" /> : <EllipsisVertical size={22} color="#1d4ed8" />}
                            </TouchableOpacity>
                        </View>
                    </View>
                    {/* Quick date filter chips */}
                    {(() => {
                        const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
                        const todayStr = toYMDUTC(nowIST);
                        const tomorrowIST = new Date(nowIST.getTime() + 86400000);
                        const tomorrowStr = toYMDUTC(tomorrowIST);
                        const isAllTime = !dateFrom && !dateTo;
                        const isToday = dateFrom === todayStr && dateTo === todayStr;
                        const isTomorrow = dateFrom === tomorrowStr && dateTo === tomorrowStr;
                        const isCustom = !isAllTime && !isToday && !isTomorrow && (dateFrom || dateTo);

                        const chipStyle = (active: boolean) => ({
                            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
                            backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.18)',
                            borderWidth: 1,
                            borderColor: active ? '#fff' : 'rgba(255,255,255,0.35)',
                        });
                        const chipTextStyle = (active: boolean) => ({
                            color: active ? '#1d4ed8' : '#e0e7ff',
                            fontWeight: '700' as const, fontSize: 13,
                        });

                        return (
                            <View className="mt-3">
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View className="flex-row">
                                        <TouchableOpacity
                                            style={chipStyle(isAllTime)}
                                            onPress={() => {
                                                setDateFrom('');
                                                setDateTo('');
                                                setShowQuickDatePicker(false);
                                            }}
                                        >
                                            <Text style={chipTextStyle(isAllTime)}>All Time</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={chipStyle(isToday)}
                                            onPress={() => {
                                                if (isToday) { setDateFrom(''); setDateTo(''); }
                                                else { setDateFrom(todayStr); setDateTo(todayStr); setShowQuickDatePicker(false); }
                                            }}
                                        >
                                            <Text style={chipTextStyle(isToday)}>Today</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={chipStyle(isTomorrow)}
                                            onPress={() => {
                                                if (isTomorrow) { setDateFrom(''); setDateTo(''); }
                                                else { setDateFrom(tomorrowStr); setDateTo(tomorrowStr); setShowQuickDatePicker(false); }
                                            }}
                                        >
                                            <Text style={chipTextStyle(isTomorrow)}>Tomorrow</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={chipStyle(isCustom as boolean)}
                                            onPress={() => setShowQuickDatePicker(prev => !prev)}
                                        >
                                            <Text style={chipTextStyle(isCustom as boolean)}>
                                                {isCustom ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Pick Date'}
                                            </Text>
                                        </TouchableOpacity>
                                        {(dateFrom || dateTo) && (
                                            <TouchableOpacity
                                                style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,100,100,0.25)', borderWidth: 1, borderColor: 'rgba(255,150,150,0.5)' }}
                                                onPress={() => { setDateFrom(''); setDateTo(''); setShowQuickDatePicker(false); }}
                                            >
                                                <Text style={{ color: '#fca5a5', fontWeight: '700', fontSize: 13 }}>✕ Clear</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </ScrollView>

                                {/* Inline calendar for custom date */}
                                {showQuickDatePicker && (
                                    <View className="mt-3 bg-white rounded-2xl overflow-hidden" style={{ elevation: 8 }}>
                                        <View className="px-4 pt-3 pb-1 flex-row justify-between items-center">
                                            <Text className="font-bold text-gray-700 text-sm">Pick a date</Text>
                                            <TouchableOpacity onPress={() => setShowQuickDatePicker(false)}>
                                                <X size={16} color="#6b7280" />
                                            </TouchableOpacity>
                                        </View>
                                        <CalendarPicker
                                            selectedDate={dateFrom}
                                            onSelect={(d) => {
                                                setDateFrom(d);
                                                setDateTo(d);
                                                setShowQuickDatePicker(false);
                                            }}
                                        />
                                    </View>
                                )}
                            </View>
                        );
                    })()}

                    {headerMenuVisible && (
                        <View
                            className="absolute right-5 top-20 w-64 bg-white rounded-2xl border border-blue-100 overflow-hidden"
                            style={{ zIndex: 80, elevation: 12 }}
                        >
                            <TouchableOpacity
                                onPress={() => {
                                    setExportError('');
                                    setExportModalVisible(true);
                                    setHeaderMenuVisible(false);
                                }}
                                className="px-4 py-3 flex-row items-center border-b border-gray-100"
                            >
                                <Download size={14} color="#1f2937" />
                                <Text className="text-sm text-gray-800 font-medium ml-2">Download Report</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setFilterModalVisible(true);
                                    setHeaderMenuVisible(false);
                                }}
                                className="px-4 py-3 flex-row items-center border-b border-gray-100"
                            >
                                <CalendarRange size={14} color="#1f2937" />
                                <Text className="text-sm text-gray-800 font-medium ml-2">Date Range Filter</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setSearchQuery('');
                                    setDateFrom('');
                                    setDateTo('');
                                    setStatusFilter('ALL');
                                    setOpenCardMenuId(null);
                                    setHeaderMenuVisible(false);
                                }}
                                className="px-4 py-3 flex-row items-center"
                            >
                                <Eraser size={14} color="#1f2937" />
                                <Text className="text-sm text-gray-800 font-medium ml-2">Clear Filters</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {showSearch && (
                        <View className="mt-4 bg-white/95 rounded-2xl px-4 py-3 flex-row items-center">
                            <Search size={16} color="#6b7280" />
                            <TextInput
                                ref={searchInputRef}
                                className="flex-1 ml-2 text-gray-800 text-sm"
                                placeholder="Search by patient, clinic, phone, booking id"
                                placeholderTextColor="#9ca3af"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus
                            />
                        </View>
                    )}
                    {(dateFrom || dateTo) && (
                        <Text className="text-blue-100 text-xs mt-2">
                            Date filter: {dateFrom || 'Any'} to {dateTo || 'Any'}
                        </Text>
                    )}
                    <View className="mt-3">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View className="flex-row">
                                {(['ALL', 'BOOKED', 'PENDING', 'COMPLETED', 'CANCELLED'] as const).map((status) => {
                                    const active = statusFilter === status;
                                    return (
                                        <TouchableOpacity
                                            key={status}
                                            style={{
                                                paddingHorizontal: 14,
                                                paddingVertical: 7,
                                                borderRadius: 20,
                                                marginRight: 8,
                                                backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.18)',
                                                borderWidth: 1,
                                                borderColor: active ? '#fff' : 'rgba(255,255,255,0.35)',
                                            }}
                                            onPress={() => setStatusFilter(status)}
                                        >
                                            <Text style={{
                                                color: active ? '#1d4ed8' : '#e0e7ff',
                                                fontWeight: '700',
                                                fontSize: 13,
                                            }}>
                                                {status === 'ALL'
                                                    ? 'All Status'
                                                    : status === 'PENDING'
                                                        ? 'Not Visited'
                                                        : status === 'COMPLETED'
                                                            ? 'Visited'
                                                            : status.charAt(0) + status.slice(1).toLowerCase()}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </View>

                {/* List */}
                <FlashList
                    data={filteredAppointments}
                    keyExtractor={(item, index) =>
                        item.appointment_id
                            ? `apt:${item.appointment_id}:${index}`
                            : `pair:${item.patient_id}-${item.doctor_id}-${item.appointment_date || 'na'}-${item.start_time || 'na'}:${index}`
                    }
                    renderItem={renderItem}
                    onScrollBeginDrag={() => {
                        if (openCardMenuId !== null) setOpenCardMenuId(null);
                    }}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1d4ed8']} />
                    }
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Activity size={48} color="#9ca3af" />
                            <Text className="text-gray-500 font-semibold text-base mt-4">
                                No appointments found
                            </Text>
                            <Text className="text-gray-400 text-sm mt-1">
                                Your upcoming appointments will appear here
                            </Text>
                        </View>
                    }
                />
                {canUseChat && (
                    <IncomingMessageBubble
                        message={incomingMessage}
                        onPress={(message) => {
                            setIncomingMessage(null);
                            navigation.navigate('Chat', {
                                patientId: message.patientId,
                                doctorId: message.doctorId,
                                patientName: message.senderName,
                                viewer: 'DOCTOR',
                            });
                        }}
                    />
                )}
            </View>

            {/* Export Modal */}
            <Modal
                animationType="slide"
                transparent
                visible={exportModalVisible}
                onRequestClose={() => setExportModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-xl font-bold text-gray-800">Download Appointments</Text>
                            <TouchableOpacity onPress={() => setExportModalVisible(false)} className="bg-gray-100 p-2 rounded-full">
                                <X size={18} color="#374151" />
                            </TouchableOpacity>
                        </View>

                        <View className="space-y-4">
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-2">Timeframe</Text>
                                <View className="flex-row flex-wrap gap-2">
                                    {[
                                        { value: 'ONE_DAY', label: '1 Day' },
                                        { value: 'ONE_WEEK', label: '1 Week' },
                                        { value: 'ONE_MONTH', label: '1 Month' },
                                        { value: 'CUSTOM', label: 'Custom Range' },
                                    ].map((item) => {
                                        const active = exportPreset === item.value;
                                        return (
                                            <TouchableOpacity
                                                key={item.value}
                                                onPress={() => setExportPreset(item.value as typeof exportPreset)}
                                                className={`px-3 py-2 rounded-xl border ${active ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200'}`}
                                            >
                                                <Text className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-gray-600'}`}>
                                                    {item.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {exportPreset === 'CUSTOM' && (
                                    <View className="mt-3 space-y-3">
                                        <View>
                                            <Text className="text-sm font-bold text-gray-700 mb-1">From (YYYY-MM-DD)</Text>
                                            <TouchableOpacity
                                                onPress={() => setExportCalendarMode(exportCalendarMode === 'FROM' ? null : 'FROM')}
                                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
                                            >
                                                <Text className={`text-base ${exportFrom ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                                    {exportFrom ? formatDisplayDate(exportFrom) : 'Select date'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View>
                                            <Text className="text-sm font-bold text-gray-700 mb-1">To (YYYY-MM-DD)</Text>
                                            <TouchableOpacity
                                                onPress={() => setExportCalendarMode(exportCalendarMode === 'TO' ? null : 'TO')}
                                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
                                            >
                                                <Text className={`text-base ${exportTo ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                                    {exportTo ? formatDisplayDate(exportTo) : 'Select date'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        {exportCalendarMode && (
                                            <View className="mt-2">
                                                <CalendarPicker
                                                    selectedDate={exportCalendarMode === 'FROM' ? exportFrom : exportTo}
                                                    onSelect={(d) => {
                                                        if (exportCalendarMode === 'FROM') {
                                                            setExportFrom(d);
                                                            if (exportTo && exportTo < d) setExportTo(d);
                                                        } else {
                                                            setExportTo(d);
                                                        }
                                                        setExportCalendarMode(null);
                                                    }}
                                                    minDate={exportCalendarMode === 'TO' ? (exportFrom || '1900-01-01') : '1900-01-01'}
                                                />
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>

                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-2">Format</Text>
                                <View className="flex-row gap-2">
                                    {[
                                        { value: 'pdf', label: 'PDF' },
                                        { value: 'excel', label: 'Excel' },
                                    ].map((item) => {
                                        const active = exportFormat === item.value;
                                        return (
                                            <TouchableOpacity
                                                key={item.value}
                                                onPress={() => setExportFormat(item.value as typeof exportFormat)}
                                                className={`px-3 py-2 rounded-xl border ${active ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200'}`}
                                            >
                                                <Text className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-gray-600'}`}>
                                                    {item.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {exportError ? (
                                <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                    <Text className="text-sm text-red-600">{exportError}</Text>
                                </View>
                            ) : null}
                        </View>

                        <View className="flex-row justify-end gap-3 mt-5">
                            <TouchableOpacity
                                onPress={() => setExportModalVisible(false)}
                                disabled={exporting}
                                className="px-4 py-3 rounded-xl bg-gray-100"
                            >
                                <Text className="text-gray-600 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleExportDownload}
                                disabled={exporting}
                                className="px-4 py-3 rounded-xl bg-blue-600"
                            >
                                {exporting ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-semibold">Download</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Filter Modal */}
            <Modal
                animationType="slide"
                transparent
                visible={filterModalVisible}
                onRequestClose={() => setFilterModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-xl font-bold text-gray-800">Date Range Filter</Text>
                            <TouchableOpacity onPress={() => setFilterModalVisible(false)} className="bg-gray-100 p-2 rounded-full">
                                <X size={18} color="#374151" />
                            </TouchableOpacity>
                        </View>
                        <View className="space-y-3">
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-1">From (YYYY-MM-DD)</Text>
                                <TextInput
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                                    value={dateFrom}
                                    onChangeText={setDateFrom}
                                    placeholder="e.g. 2026-02-01"
                                />
                            </View>
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-1">To (YYYY-MM-DD)</Text>
                                <TextInput
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                                    value={dateTo}
                                    onChangeText={setDateTo}
                                    placeholder="e.g. 2026-02-29"
                                />
                            </View>
                        </View>
                        <View className="flex-row justify-end gap-3 mt-5">
                            <TouchableOpacity
                                onPress={() => { setDateFrom(''); setDateTo(''); }}
                                className="px-4 py-3 rounded-xl bg-gray-100"
                            >
                                <Text className="text-gray-600 font-semibold">Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setFilterModalVisible(false)} className="px-4 py-3 rounded-xl bg-blue-600">
                                <Text className="text-white font-semibold">Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── Add Appointment Modal ── */}
            <Modal
                animationType="slide"
                transparent
                visible={isModalVisible}
                onRequestClose={() => { setModalVisible(false); resetForm(); }}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 72}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-6 h-[92%]">

                            {/* Modal header */}
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-2xl font-bold text-gray-800">New Appointment</Text>
                                <TouchableOpacity
                                    onPress={() => { setModalVisible(false); resetForm(); }}
                                    className="bg-gray-100 p-2 rounded-full"
                                >
                                    <X size={24} color="#4b5563" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <View className="space-y-5 pb-6">

                                    {/* Patient Phone */}
                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">
                                            Patient Phone <Text className="text-red-500">*</Text>
                                        </Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="Enter phone number"
                                            keyboardType="phone-pad"
                                            value={formData.patient_phone}
                                            onChangeText={t => setFormData({ ...formData, patient_phone: t })}
                                        />
                                        {lookupLoading && (
                                            <Text className="text-xs text-gray-400 mt-2">Checking existing patients...</Text>
                                        )}
                                    </View>

                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Booking For</Text>
                                        <View className="flex-row gap-2">
                                            {(['SELF', 'OTHER'] as BookingFor[]).map((value) => {
                                                const active = formData.booking_for === value;
                                                return (
                                                    <TouchableOpacity
                                                        key={value}
                                                        onPress={() => setFormData({ ...formData, booking_for: value })}
                                                        className={`flex-1 rounded-xl border px-4 py-3 items-center ${active ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
                                                    >
                                                        <Text className={`font-semibold text-sm ${active ? 'text-blue-700' : 'text-gray-600'}`}>
                                                            {value === 'SELF' ? 'Self' : 'Other'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Patient Name */}
                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">
                                            Patient Name <Text className="text-red-500">*</Text>
                                        </Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="Enter full name"
                                            value={formData.patient_name}
                                            onChangeText={t => setFormData({ ...formData, patient_name: t })}
                                        />
                                        {matchedPatients.length > 0 && (
                                            <View className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-3">
                                                <Text className="text-xs font-bold text-amber-700">Existing names on this phone</Text>
                                                <View className="flex-row flex-wrap mt-2">
                                                    {matchedPatients.map((patient) => (
                                                        <TouchableOpacity
                                                            key={patient.patient_id}
                                                            onPress={() => setFormData({
                                                                ...formData,
                                                                patient_name: patient.full_name || '',
                                                                booking_for: 'SELF',
                                                            })}
                                                            className="px-3 py-1.5 rounded-full bg-white border border-amber-200 mr-2 mb-2"
                                                        >
                                                            <Text className="text-xs font-semibold text-amber-700">
                                                                {patient.full_name || 'Unnamed patient'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                                <Text className="text-[11px] text-amber-700">
                                                    Same name reuses the same patient. Different name books for Other on the same phone.
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Clinic Dropdown */}
                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">
                                            Clinic <Text className="text-red-500">*</Text>
                                        </Text>
                                        <ClinicDropdown
                                            clinics={clinics}
                                            selectedId={formData.clinic_id}
                                            onSelect={id =>
                                                setFormData({ ...formData, clinic_id: id, date: '', time: '' })
                                            }
                                        />
                                    </View>

                                    {/* Date — calendar toggle */}
                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">
                                            Appointment Date <Text className="text-red-500">*</Text>
                                        </Text>

                                        <TouchableOpacity
                                            onPress={() => setShowCalendar(prev => !prev)}
                                            className={`bg-gray-50 border px-4 py-3.5 flex-row items-center justify-between rounded-xl
                                            ${showCalendar ? 'border-blue-500' : 'border-gray-200'}`}
                                        >
                                            <Text className={`text-base ${formData.date ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                                {formData.date ? formatDisplayDate(formData.date) : 'Select a date'}
                                            </Text>
                                            <ChevronDown
                                                size={18}
                                                color="#9ca3af"
                                                style={{ transform: [{ rotate: showCalendar ? '180deg' : '0deg' }] }}
                                            />
                                        </TouchableOpacity>

                                        {showCalendar && (
                                            <View className="mt-3">
                                                <CalendarPicker
                                                    selectedDate={formData.date}
                                                    onSelect={d => {
                                                        setFormData({ ...formData, date: d, time: '' });
                                                        
                                                        setShowCalendar(false);
                                                    }}
                                                    minDate={getISTTodayYMD()}
                                                    enabledDates={formData.clinic_id ? availableDates : undefined}
                                                    loadingDates={!!formData.clinic_id && loadingDates}
                                                />
                                                {!formData.clinic_id && (
                                                    <Text className="text-xs text-gray-400 text-center mt-3">
                                                        Select a clinic first to see available slot dates.
                                                    </Text>
                                                )}
                                                {!!formData.clinic_id && !loadingDates && availableDates.size === 0 && (
                                                    <Text className="text-xs text-gray-400 text-center mt-3">
                                                        No available slot dates found for this clinic yet.
                                                    </Text>
                                                )}
                                            </View>
                                        )}
                                    </View>

                                    {/* Time Slots */}
                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">
                                            Time Slot <Text className="text-red-500">*</Text>
                                        </Text>

                                        {loadingSlots ? (
                                            <View className="py-4 items-center">
                                                <ActivityIndicator size="small" color="#2563eb" />
                                                <Text className="text-gray-400 text-sm mt-2">
                                                    Fetching available slots...
                                                </Text>
                                            </View>
                                        ) : availableSlots.length > 0 ? (
                                            <View className="flex-row flex-wrap gap-2">
                                                {availableSlots.map(slot => {
                                                    const isSelected = formData.time === slot;
                                                    return (
                                                        <TouchableOpacity
                                                            key={slot}
                                                            onPress={() => setFormData({ ...formData, time: slot })}
                                                            className={`rounded-xl border px-3 py-2
                                                            ${isSelected
                                                                    ? 'bg-blue-50 border-blue-500'
                                                                    : 'bg-white border-gray-200'}`}
                                                        >
                                                            <Text className={`font-semibold text-sm
                                                            ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                                                                {to12h(slot)}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        ) : (
                                            <View className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 items-center">
                                                <Text className="text-gray-400 text-sm italic text-center">
                                                    {formData.clinic_id && formData.date
                                                        ? 'No slots available for this date'
                                                        : 'Select a clinic and date to see available slots'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Summary strip */}
                                    {formData.clinic_id && formData.date && formData.time && (
                                        <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4">
                                            <Text className="text-blue-700 font-bold text-sm mb-2">
                                                Appointment Summary
                                            </Text>
                                            <Text className="text-blue-600 text-sm">
                                                 {formatDisplayDate(formData.date)}{'  ·  '} {to12h(formData.time)}
                                            </Text>
                                            <Text className="text-blue-600 text-sm mt-1">
                                                 {clinics.find(c => c.clinic_id.toString() === formData.clinic_id)?.clinic_name}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Submit */}
                                    <TouchableOpacity
                                        onPress={handleCreateAppointment}
                                        disabled={submitting}
                                        className={`bg-blue-600 rounded-2xl py-4 items-center shadow-md elevation-4
                                        ${submitting ? 'opacity-70' : 'opacity-100'}`}
                                    >
                                        {submitting
                                            ? <ActivityIndicator color="white" />
                                            : <Text className="text-white font-bold text-lg">Book Appointment</Text>
                                        }
                                    </TouchableOpacity>

                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                animationType="slide"
                transparent
                visible={rescheduleModalVisible}
                onRequestClose={() => setRescheduleModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[88%]">
                        <Text className="text-xl font-bold text-gray-800 mb-4">Reschedule Appointment</Text>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View className="space-y-4 pb-6">
                                {/* Date */}
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Date</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowRescheduleCalendar((prev) => !prev)}
                                        className={`bg-gray-50 border px-4 py-3.5 flex-row items-center justify-between rounded-xl
                                            ${showRescheduleCalendar ? 'border-blue-500' : 'border-gray-200'}`}
                                    >
                                        <Text className={`text-base ${rescheduleDate ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                            {rescheduleDate ? formatDisplayDate(rescheduleDate) : 'Select a date'}
                                        </Text>
                                        <ChevronDown
                                            size={18}
                                            color="#9ca3af"
                                            style={{ transform: [{ rotate: showRescheduleCalendar ? '180deg' : '0deg' }] }}
                                        />
                                    </TouchableOpacity>
                                    {showRescheduleCalendar && (
                                        <View className="mt-3">
                                            <CalendarPicker
                                                selectedDate={rescheduleDate}
                                                onSelect={(d) => {
                                                    setRescheduleDate(d);
                                                    setRescheduleStart('');
                                                    setRescheduleEnd('');
                                                    setShowRescheduleCalendar(false);
                                                }}
                                                minDate={getISTTodayYMD()}
                                                enabledDates={rescheduleClinicId ? rescheduleAvailableDates : undefined}
                                                loadingDates={!!rescheduleClinicId && rescheduleLoadingDates}
                                            />
                                            {!rescheduleClinicId && (
                                                <Text className="text-xs text-gray-400 text-center mt-3">
                                                    Clinic not linked for this appointment.
                                                </Text>
                                            )}
                                            {!!rescheduleClinicId && !rescheduleLoadingDates && rescheduleAvailableDates.size === 0 && (
                                                <Text className="text-xs text-gray-400 text-center mt-3">
                                                    No available slot dates found for this clinic yet.
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>

                                {/* Time Slots */}
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Time Slot</Text>
                                    {rescheduleLoadingSlots ? (
                                        <View className="py-4 items-center">
                                            <ActivityIndicator size="small" color="#2563eb" />
                                            <Text className="text-gray-400 text-sm mt-2">Fetching available slots...</Text>
                                        </View>
                                    ) : rescheduleAvailableSlots.length > 0 ? (
                                        <View className="flex-row flex-wrap gap-2">
                                            {rescheduleAvailableSlots.map((slot) => {
                                                const isSelected = rescheduleStart === slot;
                                                return (
                                                    <TouchableOpacity
                                                        key={slot}
                                                        onPress={() => setRescheduleStart(slot)}
                                                        className={`rounded-xl border px-3 py-2
                                                            ${isSelected ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200'}`}
                                                    >
                                                        <Text className={`font-semibold text-sm ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                                                            {to12h(slot)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    ) : (
                                        <View className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4 items-center">
                                            <Text className="text-gray-400 text-sm italic text-center">
                                                {rescheduleClinicId && rescheduleDate
                                                    ? 'No slots available for this date'
                                                    : 'Select a date to see available slots'}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Summary */}
                                {rescheduleDate && rescheduleStart ? (
                                    <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4">
                                        <Text className="text-blue-700 font-bold text-sm mb-2">Reschedule Summary</Text>
                                        <Text className="text-blue-600 text-sm">
                                            {formatDisplayDate(rescheduleDate)}{'  ·  '}{to12h(rescheduleStart)}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </ScrollView>
                        <View className="flex-row justify-end gap-3 mt-5">
                            <TouchableOpacity onPress={() => setRescheduleModalVisible(false)} className="px-4 py-3 rounded-xl bg-gray-100">
                                <Text className="text-gray-600 font-semibold">Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleReschedule} className="px-4 py-3 rounded-xl bg-blue-600">
                                <Text className="text-white font-semibold">Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default AppointmentsScreen;
