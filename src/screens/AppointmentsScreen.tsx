import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    ActivityIndicator,
    StatusBar,
    TouchableOpacity,
    Animated,
    Modal,
    ScrollView,
    TextInput,
    Alert,
    RefreshControl
} from 'react-native';
import {
    Activity,
    Plus,
    X,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Check,
    User,
    Circle,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointments, createAppointment } from '../api/appointments';
import { getClinics } from '../api/clinics';
import { getSlots } from '../api/slots';
import { useNavigation } from '@react-navigation/native';

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

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string; dotColor: string }> = {
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

// ─── Animated list item ───────────────────────────────────────────────────────

const AnimatedListItem = ({ children, index }: { children: React.ReactNode; index: number }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 100, useNativeDriver: true }),
        ]).start();
    }, []);

    // Animated.View doesn't support className; style is required here
    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
            {children}
        </Animated.View>
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

    useEffect(() => {
        fetchAppointments();
        fetchClinicsData();
    }, []);

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

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading appointments...</Text>
            </View>
        );
    }

    const renderItem = ({ item, index }: { item: any; index: number }) => {
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
            <AnimatedListItem index={index}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('Chat', { patientId: item.patient_id, doctorId: item.doctor_id, patientName: item.patient?.full_name || 'Unknown Patient' })}
                    activeOpacity={0.7}
                    className="bg-white rounded-2xl mb-4 overflow-hidden shadow-md elevation-4"
                >
                    {/* Card header */}
                    <View className="bg-blue-600 px-4 py-3 flex-row items-center">
                        <View className="bg-white w-9 h-9 rounded-full items-center justify-center mr-3">
                            <User size={16} color="#2563eb" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-bold text-base" numberOfLines={1}>
                                {item.patient?.full_name || 'Unknown Patient'}
                            </Text>
                            <Text className="text-blue-200 text-xs">
                                {item.clinic?.clinic_name || 'N/A'}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => alert('Pressed')}>
                            <StatusBadge status={item.status} />
                        </TouchableOpacity>
                    </View>

                    {/* Card body */}
                    <View className="px-4 py-4 flex-row justify-between">
                        <View className="flex-1 items-center">
                            <Text className="text-gray-400 text-xs">Date</Text>
                            <Text className="text-gray-800 font-semibold text-sm text-center mt-0.5">
                                {slotDate}
                            </Text>
                        </View>
                        <View className="w-px bg-gray-100 mx-2" />
                        <View className="flex-1 items-center">
                            <Text className="text-gray-400 text-xs">Time</Text>
                            <Text className="text-gray-800 font-semibold text-sm mt-0.5">{slotTime}</Text>
                        </View>
                        <View className="w-px bg-gray-100 mx-2" />
                        <View className="flex-1 items-center">
                            <Text className="text-gray-400 text-xs">Clinic</Text>
                            <Text className="text-gray-800 font-semibold text-sm text-center mt-0.5" numberOfLines={2}>
                                {item.clinic?.clinic_name || 'N/A'}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </AnimatedListItem>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-blue-800" edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <View className="flex-1 bg-gray-50">

                {/* Header */}
                <View className="bg-blue-700 px-5 pt-6 pb-8 rounded-b-3xl">
                    <View className="flex-row justify-between items-center">
                        <View>
                            <Text className="text-white text-2xl font-bold">Appointments</Text>
                            <Text className="text-blue-200 text-sm mt-1">
                                {appointments.length} total appointment{appointments.length !== 1 ? 's' : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            className="bg-white p-3 rounded-full shadow-md elevation-4"
                        >
                            <Plus size={24} color="#1d4ed8" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* List */}
                <FlatList
                    data={appointments}
                    keyExtractor={(item) => item.appointment_id?.toString() || Math.random().toString()}
                    renderItem={renderItem}
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
            </View>

            {/* ── Add Appointment Modal ── */}
            <Modal
                animationType="slide"
                transparent
                visible={isModalVisible}
                onRequestClose={() => { setModalVisible(false); resetForm(); }}
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
            </Modal>
        </SafeAreaView>
    );
};

export default AppointmentsScreen;