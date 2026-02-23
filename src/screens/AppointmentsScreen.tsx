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
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from '../api/appointments';
import { getClinics } from '../api/clinics';
import { getSlots } from '../api/slots';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { getChatNotifications, type IncomingNotificationMessage } from '../api/notifications';
import IncomingMessageBubble from '../components/IncomingMessageBubble';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';

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

const toYMD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const parseDateOnly = (value?: string) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string; dotColor: string }> = {
    booked: { dot: 'bg-indigo-500', badge: 'bg-indigo-100', label: 'text-indigo-700', dotColor: '#4338ca' },
    confirmed: { dot: 'bg-green-500', badge: 'bg-green-100', label: 'text-green-700', dotColor: '#15803d' },
    pending: { dot: 'bg-yellow-500', badge: 'bg-yellow-100', label: 'text-yellow-700', dotColor: '#a16207' },
    cancelled: { dot: 'bg-red-500', badge: 'bg-red-100', label: 'text-red-600', dotColor: '#dc2626' },
    completed: { dot: 'bg-blue-500', badge: 'bg-blue-100', label: 'text-blue-700', dotColor: '#1d4ed8' },
};

const StatusBadge = ({ status }: { status: string }) => {
    const s = STATUS_CONFIG[status?.toLowerCase()] ?? {
        dot: 'bg-gray-400', badge: 'bg-gray-100', label: 'text-gray-600', dotColor: '#4b5563',
    };
    return (
        <View className={`self-start flex-row items-center px-2 py-1 rounded-full ${s.badge}`}>
            <Circle size={8} color={s.dotColor} fill={s.dotColor} style={{ marginRight: 6 }} />
            <Text className={`text-xs font-bold ${s.label}`}>{status ?? 'Unknown'}</Text>
        </View>
    );
};

// ─── Clinic Dropdown ──────────────────────────────────────────────────────────

interface ClinicDropdownProps {
    clinics: any[];
    selectedId: string;
    onSelect: (id: string) => void;
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
}

const CalendarPicker = ({ selectedDate, onSelect, minDate }: CalendarPickerProps) => {
    const today = new Date();
    const initDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;

    const [viewYear, setViewYear] = useState(initDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(initDate.getMonth());

    const minDateObj = minDate ? new Date(minDate + 'T00:00:00') : today;
    minDateObj.setHours(0, 0, 0, 0);

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
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                    <View key={row} className="flex-row">
                        {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                            if (!day) return <View key={col} className="flex-1 m-1" />;

                            const dateObj = new Date(viewYear, viewMonth, day);
                            dateObj.setHours(0, 0, 0, 0);
                            const dateStr = toYMD(dateObj);
                            const isSelected = dateStr === selectedDate;
                            const isToday = dateStr === toYMD(today);
                            const isDisabled = dateObj < minDateObj;

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
        clinic_id: '',
        date: '',
        time: '',
    });

    const [clinics, setClinics] = useState<any[]>([]);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [slotDuration, setSlotDuration] = useState(30);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
    const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleStart, setRescheduleStart] = useState('');
    const [rescheduleEnd, setRescheduleEnd] = useState('');
    const [incomingMessage, setIncomingMessage] = useState<IncomingNotificationMessage | null>(null);
    const lastNotifCheckAtRef = useRef(new Date(Date.now() - 2 * 60 * 1000).toISOString());
    const bubbleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
    const [openCardMenuId, setOpenCardMenuId] = useState<number | null>(null);
    const [highlightedPairKey, setHighlightedPairKey] = useState<string | null>(null);

    useEffect(() => {
        fetchAppointments();
        fetchClinicsData();
    }, []);

    const checkIncomingNotifications = React.useCallback(async () => {
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
    }, []);

    useEffect(() => {
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
    }, [checkIncomingNotifications]);

    useFocusEffect(
        React.useCallback(() => {
            checkIncomingNotifications();
        }, [checkIncomingNotifications])
    );

    useEffect(() => {
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
    }, [appointments]);

    useEffect(() => {
        if (formData.clinic_id && formData.date) fetchSlotsData();
        else setAvailableSlots([]);
    }, [formData.clinic_id, formData.date]);

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
        setFormData({ patient_phone: '', patient_name: '', clinic_id: '', date: '', time: '' });
        setAvailableSlots([]);
        setShowCalendar(false);
    };

    const handleCreateAppointment = async () => {
        if (!formData.patient_phone || !formData.clinic_id || !formData.date || !formData.time) {
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
                clinic_id: formData.clinic_id,
                appointment_date: formData.date,
                start_time: formData.time,
                end_time: endTime,
            });

            Alert.alert('Success', 'Appointment created successfully');
            setModalVisible(false);
            resetForm();
            fetchAppointments();
        } catch (e) {
            Alert.alert('Error', 'Failed to create appointment');
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const toDateInput = (value: string) => {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
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

    const handleStatusChange = async (appointmentId: number, status: 'CANCELLED' | 'COMPLETED') => {
        try {
            await updateAppointment({ appointmentId, status });
            setAppointments((prev) => prev.map((a) => a.appointment_id === appointmentId ? { ...a, status } : a));
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to update appointment');
        }
    };

    const confirmStatusChange = (appointmentId: number, status: 'CANCELLED' | 'COMPLETED') => {
        const actionLabel = status === 'CANCELLED' ? 'cancel' : 'complete';
        Alert.alert(
            `${status === 'CANCELLED' ? 'Cancel' : 'Complete'} appointment`,
            `Are you sure you want to ${actionLabel} this appointment?`,
            [
                { text: 'No', style: 'cancel' },
                { text: 'Yes', onPress: () => handleStatusChange(appointmentId, status) },
            ]
        );
    };

    const handleDeleteAppointment = async (appointmentId: number) => {
        Alert.alert('Delete appointment', 'Are you sure?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteAppointment(appointmentId);
                        setAppointments((prev) => prev.filter((a) => a.appointment_id !== appointmentId));
                    } catch (error) {
                        console.error(error);
                        Alert.alert('Error', 'Failed to delete appointment');
                    }
                }
            }
        ]);
    };

    const openReschedule = (item: any) => {
        setEditingAppointmentId(item.appointment_id);
        setRescheduleDate(toDateInput(item.appointment_date));
        setRescheduleStart(toTimeInput(item.start_time));
        setRescheduleEnd(toTimeInput(item.end_time));
        setRescheduleModalVisible(true);
    };

    const handleReschedule = async () => {
        if (!editingAppointmentId || !rescheduleDate || !rescheduleStart || !rescheduleEnd) {
            Alert.alert('Error', 'Please fill date, start and end time');
            return;
        }
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
                            end_time: rescheduleEnd,
                            status: 'BOOKED',
                        });
                        setAppointments((prev) =>
                            prev.map((a) =>
                                a.appointment_id === editingAppointmentId
                                    ? { ...a, appointment_date: rescheduleDate, start_time: rescheduleStart, end_time: rescheduleEnd, status: 'BOOKED' }
                                    : a
                            )
                        );
                        setRescheduleModalVisible(false);
                        setEditingAppointmentId(null);
                    } catch (error) {
                        console.error(error);
                        Alert.alert('Error', 'Failed to reschedule appointment');
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
            const patientName = String(a?.patient?.full_name || '').toLowerCase();
            const phone = String(a?.patient?.phone || '').toLowerCase();
            const bookingId = String(a?.appointment_id || '');
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
    }, [appointments, dateFrom, dateTo, searchQuery]);

    const renderItem = useCallback(({ item }: { item: any }) => {
        const statusUpper = String(item?.status || '').toUpperCase();
        const canUpdate = statusUpper !== 'COMPLETED' && statusUpper !== 'CANCELLED';
        const isMenuOpen = openCardMenuId === item.appointment_id;
        const pairKey = `${item.patient_id}:${item.doctor_id}`;
        const isHighlighted = highlightedPairKey === pairKey;
        const slotDate = item.appointment_date
            ? new Date(item.appointment_date).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
            })
            : 'N/A';
        const slotTime = item.start_time
            ? new Date(item.start_time).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            })
            : 'N/A';

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
                        navigation.navigate('Chat', { patientId: item.patient_id, doctorId: item.doctor_id, patientName: item.patient?.full_name || 'Unknown Patient' });
                    }}
                    activeOpacity={0.7}
                >
                    <View className="flex-row items-start">
                        <View className="bg-blue-100 w-10 h-10 rounded-xl items-center justify-center mr-3">
                            <User size={16} color="#1d4ed8" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-gray-900 font-bold text-sm" numberOfLines={1}>
                                {item.patient?.full_name || 'Unknown Patient'}
                            </Text>
                            <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                                {item.clinic?.clinic_name || 'N/A'}
                            </Text>
                            <View className="mt-1.5 self-start px-2 py-1 rounded-md bg-gray-100">
                                <Text className="text-[10px] font-semibold text-gray-600">Booking #{item.appointment_id}</Text>
                            </View>
                            {isHighlighted && (
                                <View className="mt-1.5 self-start px-2 py-1 rounded-md bg-blue-600">
                                    <Text className="text-[10px] font-semibold text-white">New message</Text>
                                </View>
                            )}
                        </View>
                        <View className="items-end ml-2">
                            <StatusBadge status={item.status} />
                            <TouchableOpacity
                                onPress={() => setOpenCardMenuId((prev) => (prev === item.appointment_id ? null : item.appointment_id))}
                                className="mt-2 p-1.5 rounded-lg bg-gray-100"
                            >
                                {isMenuOpen ? <X size={14} color="#4b5563" /> : <EllipsisVertical size={14} color="#4b5563" />}
                            </TouchableOpacity>
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
                    <View className="mt-3 flex-row justify-end">
                        <View className="px-3 py-2 rounded-lg bg-blue-600 flex-row items-center">
                            <MessageCircle size={12} color="#fff" />
                            <Text className="text-white text-xs font-semibold ml-1.5">Open Chat</Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {isMenuOpen && (
                    <View
                        className="absolute top-12 right-3 w-52 bg-white rounded-xl border border-gray-200 overflow-hidden"
                        style={{ zIndex: 60, elevation: 10 }}
                    >
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
                        {canUpdate && (
                            <TouchableOpacity
                                onPress={() => {
                                    setOpenCardMenuId(null);
                                    confirmStatusChange(item.appointment_id, 'COMPLETED');
                                }}
                                className="px-4 py-3 border-b border-gray-100"
                            >
                                <Text className="text-sm text-gray-800 font-medium">Complete</Text>
                            </TouchableOpacity>
                        )}
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
    }, [confirmStatusChange, handleDeleteAppointment, highlightedPairKey, navigation, openCardMenuId, openReschedule]);

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
                            <Text className="text-blue-200 text-sm mt-1">
                                {filteredAppointments.length} shown • {appointments.length} total
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setHeaderMenuVisible((prev) => !prev)}
                            className="bg-white p-3 rounded-full"
                        >
                            {headerMenuVisible ? <X size={22} color="#1d4ed8" /> : <EllipsisVertical size={22} color="#1d4ed8" />}
                        </TouchableOpacity>
                    </View>
                    {headerMenuVisible && (
                        <View
                            className="absolute right-5 top-20 w-64 bg-white rounded-2xl border border-blue-100 overflow-hidden"
                            style={{ zIndex: 80, elevation: 12 }}
                        >
                            <TouchableOpacity
                                onPress={() => {
                                    setShowSearch((prev) => !prev);
                                    setHeaderMenuVisible(false);
                                }}
                                className="px-4 py-3 flex-row items-center border-b border-gray-100"
                            >
                                <Search size={14} color="#1f2937" />
                                <Text className="text-sm text-gray-800 font-medium ml-2">{showSearch ? 'Hide Search' : 'Search Appointments'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setModalVisible(true);
                                    setHeaderMenuVisible(false);
                                }}
                                className="px-4 py-3 flex-row items-center border-b border-gray-100"
                            >
                                <PlusCircle size={14} color="#1f2937" />
                                <Text className="text-sm text-gray-800 font-medium ml-2">New Appointment</Text>
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
                        <View className="mt-4 bg-white/95 rounded-xl px-3 py-2.5 flex-row items-center">
                            <Search size={16} color="#6b7280" />
                            <TextInput
                                className="flex-1 ml-2 text-gray-800 text-sm"
                                placeholder="Search by patient, clinic, phone, booking id"
                                placeholderTextColor="#9ca3af"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                    )}
                    {(dateFrom || dateTo) && (
                        <Text className="text-blue-100 text-xs mt-2">
                            Date filter: {dateFrom || 'Any'} to {dateTo || 'Any'}
                        </Text>
                    )}
                </View>

                {/* List */}
                <FlashList
                    data={filteredAppointments}
                    keyExtractor={(item) => item.appointment_id?.toString() || `${item.patient_id}-${item.doctor_id}`}
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
            </View>

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
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
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
                                </View>

                                {/* Patient Name */}
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">
                                        Patient Name <Text className="text-gray-400 font-normal">(Optional)</Text>
                                    </Text>
                                    <TextInput
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                        placeholder="Enter full name"
                                        value={formData.patient_name}
                                        onChangeText={t => setFormData({ ...formData, patient_name: t })}
                                    />
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
                                                minDate={toYMD(new Date())}
                                            />
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
                                                            {slot}
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
                                            📅 {formatDisplayDate(formData.date)}{'  ·  '}🕐 {formData.time}
                                        </Text>
                                        <Text className="text-blue-600 text-sm mt-1">
                                            🏥 {clinics.find(c => c.clinic_id.toString() === formData.clinic_id)?.clinic_name}
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
                    <View className="bg-white rounded-t-3xl p-6">
                        <Text className="text-xl font-bold text-gray-800 mb-4">Reschedule Appointment</Text>
                        <View className="space-y-3">
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-1">Date</Text>
                                <TextInput
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                                    placeholder="YYYY-MM-DD"
                                    value={rescheduleDate}
                                    onChangeText={setRescheduleDate}
                                />
                            </View>
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-1">Start Time</Text>
                                <TextInput
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                                    placeholder="HH:MM"
                                    value={rescheduleStart}
                                    onChangeText={setRescheduleStart}
                                />
                            </View>
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-1">End Time</Text>
                                <TextInput
                                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800"
                                    placeholder="HH:MM"
                                    value={rescheduleEnd}
                                    onChangeText={setRescheduleEnd}
                                />
                            </View>
                        </View>
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
