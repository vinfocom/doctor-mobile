import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Modal,
    ScrollView,
    TextInput,
    Alert,
    StatusBar,
    Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { CalendarPlus, Clock3, History, User, MoreVertical, Search, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { getPatientAppointments, createPatientAppointment, updatePatientAppointment } from '../api/patientAppointments';
import { getPatientProfile } from '../api/auth';
import { getClinics } from '../api/clinics';
import { getSlots, getAvailableDates } from '../api/slots';
import { getAllDoctors } from '../api/doctors';

type AppointmentItem = {
    appointment_id: number;
    booking_id?: number;
    patient_id?: number;
    doctor_id?: number;
    clinic_id?: number;
    appointment_date: string;
    start_time: string;
    status: string;
    booked_for?: 'SELF' | 'OTHER';
    relation_type?: 'SELF' | 'OTHER';
    relation_label?: string;
    doctor?: { doctor_id: number; doctor_name?: string | null; profile_pic_url?: string | null };
    clinic?: { clinic_id: number; clinic_name?: string | null };
    patient?: {
        patient_id?: number;
        booking_id?: number | null;
        full_name?: string | null;
    };
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

const formatWhen = (date?: string, time?: string) => {
    if (!date) return 'N/A';
    const ymd = toYMD(date);
    const hm = toHM(time);
    if (!ymd || !hm) return ymd || 'N/A';
    const d = new Date(`${ymd}T${hm}:00`);
    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
    });
};

const formatDateOnly = (date?: string) => {
    if (!date) return 'N/A';
    const ymd = toYMD(date);
    if (!ymd) return 'N/A';
    return new Date(ymd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
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

const getRelationBadgeText = (item?: AppointmentItem | null, relationTypeOverride?: 'SELF' | 'OTHER') => {
    if (!item) return '';
    if (item.relation_label) return item.relation_label;
    const relationType = relationTypeOverride || item.relation_type;
    if (relationType === 'OTHER') {
        const otherName = String(item.patient?.full_name || '').trim() || 'Patient';
        return `Other: ${otherName}`;
    }
    return 'Self';
};

const normalizeName = (value?: string | null) => String(value || '').trim().toLowerCase();

export default function PatientAppointmentsScreen() {
    type BookingFor = 'SELF' | 'OTHER';
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [items, setItems] = useState<AppointmentItem[]>([]);
    const [patientName, setPatientName] = useState('');
    const [otherPatientName, setOtherPatientName] = useState('');
    const [hasOtherContext, setHasOtherContext] = useState(false);
    const [doctors, setDoctors] = useState<Array<{ doctor_id: number; doctor_name: string; specialization?: string | null; profile_pic_url?: string | null }>>([]);
    const [allClinics, setAllClinics] = useState<any[]>([]);
    const [clinics, setClinics] = useState<any[]>([]);
    const [slots, setSlots] = useState<string[]>([]);
    const [slotDuration, setSlotDuration] = useState(30);
    const [booking, setBooking] = useState(false);
    const [open, setOpen] = useState(false);
    const [openCardMenuId, setOpenCardMenuId] = useState<number | null>(null);
    const [selectedAppointment, setSelectedAppointment] = useState<AppointmentItem | null>(null);
    const [showDoctorSearch, setShowDoctorSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
    const [loadingDates, setLoadingDates] = useState(false);
    const [activeTab, setActiveTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
    const todayIST = (() => {
        const n = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
    })();
    const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(() => {
        const n = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        return { year: n.getUTCFullYear(), month: n.getUTCMonth() };
    });

    const [form, setForm] = useState({
        doctor_id: '',
        clinic_id: '',
        date: '',
        time: '',
        booking_for: 'SELF' as BookingFor,
        patient_name: '',
    });

    const loadAll = async () => {
        const [apptsRes, profileRes, clinicsRes, doctorsRes] = await Promise.all([
            getPatientAppointments(),
            getPatientProfile().catch(() => null),
            getClinics().catch(() => ({ clinics: [] })),
            getAllDoctors().catch(() => ({ doctors: [] })),
        ]);

        const appts = (apptsRes?.appointments || []) as AppointmentItem[];
        if (__DEV__) {
            console.log(`[appointments] fetched ${appts.length} appointments`);
        }
        setItems(appts);
        const selfProfile = (profileRes?.linked_profiles || []).find((item: any) => String(item?.profile_type || '').toUpperCase() === 'SELF');
        const otherProfile = (profileRes?.linked_profiles || []).find((item: any) => String(item?.profile_type || '').toUpperCase() === 'OTHER');
        const nextSelfName = selfProfile?.full_name || profileRes?.patient?.full_name || '';
        const nextOtherName = otherProfile?.full_name || '';
        setHasOtherContext(Boolean(otherProfile));
        setPatientName(nextSelfName);
        setOtherPatientName(nextOtherName);
        setForm((prev) => ({
            ...prev,
            patient_name: prev.booking_for === 'OTHER' ? nextOtherName : nextSelfName,
        }));

        const ds = ((doctorsRes?.doctors || []) as any[])
            .filter((d) => d?.doctor_id)
            .map((d) => ({
                doctor_id: d.doctor_id,
                doctor_name: d.doctor_name || 'Doctor',
                specialization: d?.specialization ?? null,
                profile_pic_url: d?.profile_pic_url ?? null,
            }));
        setDoctors(ds);

        const all = (clinicsRes?.clinics || []) as any[];
        setAllClinics(all);
        const cs = all.filter((c: any) => {
            if (!form.doctor_id) return true;
            return String(c?.doctor_id || '') === String(form.doctor_id);
        });
        setClinics(cs);
    };

    useEffect(() => {
        loadAll().catch(() => undefined).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!form.date || !form.clinic_id) {
            setSlots([]);
            setSlotDuration(30);
            return;
        }
        getSlots(form.date, Number(form.clinic_id), form.doctor_id ? Number(form.doctor_id) : undefined)
            .then((res) => {
                setSlots(res?.slots || []);
                if (res?.slot_duration) setSlotDuration(Number(res.slot_duration));
            })
            .catch(() => setSlots([]));
    }, [form.date, form.clinic_id, form.doctor_id]);

    // Fetch available dates whenever doctor + clinic are both selected
    useEffect(() => {
        if (!form.doctor_id || !form.clinic_id) {
            setAvailableDates(new Set());
            return;
        }
        setLoadingDates(true);
        getAvailableDates(Number(form.doctor_id), Number(form.clinic_id))
            .then((dates) => setAvailableDates(new Set(dates)))
            .catch(() => setAvailableDates(new Set()))
            .finally(() => setLoadingDates(false));
    }, [form.doctor_id, form.clinic_id]);

    useEffect(() => {
        const filtered = allClinics.filter((c) => {
            if (!form.doctor_id) return true;
            return String(c?.doctor_id || '') === String(form.doctor_id);
        });
        setClinics(filtered);
    }, [form.doctor_id, allClinics]);

    const now = Date.now();
    const withTs = (a: AppointmentItem) => {
        const ymd = toYMD(a.appointment_date);
        const hm = toHM(a.start_time);
        const ts = ymd && hm ? new Date(`${ymd}T${hm}:00`).getTime() : 0;
        return { ...a, ts };
    };

    const upcoming = useMemo(() => {
        return items
            .map(withTs)
            .filter((a: any) => a.ts >= now)
            .sort((a: any, b: any) => a.ts - b.ts);
    }, [items, now]);
    const past = useMemo(() => {
        return items
            .map(withTs)
            .filter((a: any) => a.ts < now)
            .sort((a: any, b: any) => b.ts - a.ts);
    }, [items, now]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadAll().catch(() => undefined);
        setRefreshing(false);
    };

    const submitBooking = async () => {
        if (!form.doctor_id || !form.clinic_id || !form.date || !form.time) {
            Alert.alert('Error', 'Please choose doctor, clinic, date and time');
            return;
        }
        if (!selectedAppointment && !form.patient_name.trim()) {
            Alert.alert('Error', form.booking_for === 'OTHER' ? 'Please enter other patient name' : 'Self profile name is missing');
            return;
        }
        setBooking(true);
        try {
            if (selectedAppointment) {
                const { appointmentId, appointment_id, booking_id } = getActionAppointmentIds(selectedAppointment);
                if (!appointmentId) {
                    Alert.alert('Error', 'Unable to reschedule this appointment.');
                    return;
                }
                await updatePatientAppointment({
                    appointmentId,
                    appointment_id: appointment_id ?? undefined,
                    booking_id: booking_id ?? undefined,
                    patient_id: selectedAppointment.patient_id,
                    doctor_id: selectedAppointment.doctor_id,
                    clinic_id: selectedAppointment.clinic_id,
                    booked_for: selectedAppointment.booked_for as 'SELF' | 'OTHER' | undefined,
                    appointment_date: form.date,
                    start_time: form.time,
                    rescheduled_by: 'PATIENT',
                });
                Alert.alert('Success', 'Appointment rescheduled');
            } else {
                await createPatientAppointment({
                    doctor_id: Number(form.doctor_id),
                    clinic_id: Number(form.clinic_id),
                    appointment_date: form.date,
                    start_time: form.time,
                    booking_for: form.booking_for,
                    patient_name: form.patient_name,
                });
                Alert.alert('Success', 'Appointment booked');
            }
            setOpen(false);
            setForm({ doctor_id: '', clinic_id: '', date: '', time: '', booking_for: 'SELF', patient_name: patientName });
            setSelectedAppointment(null);
            await loadAll();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to process appointment');
        } finally {
            setBooking(false);
        }
    };

    const getActionAppointmentIds = (item?: AppointmentItem | null) => {
        if (!item) return { appointmentId: null, appointment_id: null, booking_id: null };
        const appointment_id = item.appointment_id ?? null;
        const booking_id = item.booking_id ?? item.patient?.booking_id ?? null;
        const appointmentId = appointment_id ?? booking_id ?? null;
        return { appointmentId, appointment_id, booking_id };
    };

    const cancelBooking = async (item: AppointmentItem) => {
        const { appointmentId, appointment_id, booking_id } = getActionAppointmentIds(item);
        if (!appointmentId && !appointment_id && !booking_id) {
            Alert.alert('Error', 'Unable to cancel this appointment.');
            return;
        }
        Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes, Cancel',
                style: 'destructive',
                onPress: async () => {
                    setCancelling(true);
                    try {
                        const baseMeta = {
                            patient_id: item.patient_id,
                            doctor_id: item.doctor_id,
                            clinic_id: item.clinic_id,
                            booked_for: item.booked_for as 'SELF' | 'OTHER' | undefined,
                        };
                        const attempts = [
                            { appointmentId: appointment_id ?? undefined, appointment_id: appointment_id ?? undefined, ...baseMeta },
                            { appointmentId: booking_id ?? undefined, booking_id: booking_id ?? undefined, ...baseMeta },
                            { appointmentId: appointment_id ?? undefined, booking_id: booking_id ?? undefined, ...baseMeta },
                            { appointmentId: booking_id ?? undefined, appointment_id: appointment_id ?? undefined, ...baseMeta },
                        ].filter((payload) => Object.values(payload).some(Boolean));

                        let lastError: any = null;
                        for (const payload of attempts) {
                            try {
                                await updatePatientAppointment({
                                    ...payload,
                                    status: 'CANCELLED',
                                    cancelled_by: 'PATIENT',
                                });
                                lastError = null;
                                break;
                            } catch (error: any) {
                                lastError = error;
                                const status = error?.response?.status;
                                if (status !== 404) {
                                    throw error;
                                }
                            }
                        }
                        if (lastError) throw lastError;
                        Alert.alert('Success', 'Appointment cancelled');
                        await loadAll();
                    } catch (error: any) {
                        Alert.alert('Error', error?.response?.data?.error || 'Failed to cancel appointment');
                    } finally {
                        setCancelling(false);
                    }
                },
            },
        ]);
    };

    const handleReschedule = (item: AppointmentItem) => {
        setSelectedAppointment(item);
        setForm({
            doctor_id: String(item.doctor?.doctor_id || ''),
            clinic_id: String(item.clinic?.clinic_id || ''),
            date: toYMD(item.appointment_date),
            time: toHM(item.start_time),
            booking_for: item.relation_type === 'OTHER' ? 'OTHER' : 'SELF',
            patient_name: item.patient?.full_name || (item.relation_type === 'OTHER' ? otherPatientName : patientName),
        });
        setOpen(true);
    };

    const handleCloseModal = () => {
        setOpen(false);
        setSelectedAppointment(null);
        setForm({ doctor_id: '', clinic_id: '', date: '', time: '', booking_for: 'SELF', patient_name: patientName });
        setShowDoctorSearch(false);
        setSearchQuery('');
        setAvailableDates(new Set());
    };

    // ── Inline Calendar helpers ──────────────────────────────────────────────
    const renderCalendar = () => {
        const { year, month } = calMonth;
        const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

        const cells: (number | null)[] = [
            ...Array(firstDow).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        // pad to full weeks
        while (cells.length % 7 !== 0) cells.push(null);

        const prevMonth = () => setCalMonth(({ year: y, month: m }) => {
            if (m === 0) return { year: y - 1, month: 11 };
            return { year: y, month: m - 1 };
        });
        const nextMonth = () => setCalMonth(({ year: y, month: m }) => {
            if (m === 11) return { year: y + 1, month: 0 };
            return { year: y, month: m + 1 };
        });

        const monthName = new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

        // Disable prev arrow if we are already at today's month
        const nowIST2 = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const isCurrentMonth = year === nowIST2.getUTCFullYear() && month === nowIST2.getUTCMonth();

        return (
            <View className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {/* Header */}
                <View className="flex-row items-center justify-between px-4 py-3 bg-blue-50">
                    <TouchableOpacity
                        onPress={prevMonth}
                        disabled={isCurrentMonth}
                        className={`p-1 rounded-full ${isCurrentMonth ? 'opacity-20' : ''}`}
                    >
                        <ChevronLeft size={18} color="#1d4ed8" />
                    </TouchableOpacity>
                    <Text className="text-blue-800 font-bold text-sm">{monthName}</Text>
                    <TouchableOpacity onPress={nextMonth} className="p-1 rounded-full">
                        <ChevronRight size={18} color="#1d4ed8" />
                    </TouchableOpacity>
                </View>

                {/* Day labels */}
                <View className="flex-row bg-gray-50">
                    {DAY_LABELS.map(l => (
                        <View key={l} className="flex-1 items-center py-1.5">
                            <Text className="text-xs text-gray-400 font-semibold">{l}</Text>
                        </View>
                    ))}
                </View>

                {/* Loading overlay */}
                {loadingDates ? (
                    <View className="items-center py-6">
                        <ActivityIndicator size="small" color="#2563eb" />
                        <Text className="text-xs text-gray-400 mt-2">Loading available dates...</Text>
                    </View>
                ) : (
                    <View className="flex-row flex-wrap px-1 pb-2">
                        {cells.map((day, idx) => {
                            if (!day) return <View key={`e-${idx}`} style={{ width: '14.28%' }} className="py-2" />;

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isAvailable = availableDates.has(dateStr);
                            const isSelected = form.date === dateStr;
                            const isPast = dateStr < todayIST;
                            const disabled = !isAvailable || isPast;

                            return (
                                <TouchableOpacity
                                    key={dateStr}
                                    disabled={disabled}
                                    onPress={() => setForm(p => ({ ...p, date: dateStr, time: '' }))}
                                    style={{ width: '14.28%' }}
                                    className="items-center py-1.5"
                                >
                                    <View className={`w-8 h-8 rounded-full items-center justify-center
                                        ${isSelected ? 'bg-blue-600' :
                                            disabled ? '' : 'bg-blue-50'}`}>
                                        <Text className={`text-sm font-semibold
                                            ${isSelected ? 'text-white' :
                                                disabled ? 'text-gray-300' : 'text-blue-700'}`}>
                                            {day}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>
        );
    };

    const filteredDoctors = useMemo(() => {
        if (!searchQuery.trim()) return doctors;
        const q = searchQuery.toLowerCase();
        return doctors.filter((d) => {
            const doctorName = String(d.doctor_name || '').toLowerCase();
            const specialization = String(d.specialization || '').toLowerCase();
            return doctorName.includes(q) || specialization.includes(q);
        });
    }, [doctors, searchQuery]);


    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-blue-700">
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <View className="flex-1 bg-gray-50">
                <View className="bg-blue-700 px-5 pt-6 pb-6 rounded-b-3xl">
                    <View className="flex-row items-center justify-between">
                        <View>
                            <Text className="text-blue-100 text-sm">Patient Portal</Text>
                            <Text className="text-white text-2xl font-bold mt-1">My Appointments</Text>
                        </View>
                        <TouchableOpacity onPress={() => { setSelectedAppointment(null); setForm({ doctor_id: '', clinic_id: '', date: '', time: '', booking_for: 'SELF', patient_name: patientName }); setOpen(true); }} className="bg-white rounded-full p-3">
                            <CalendarPlus size={20} color="#1d4ed8" />
                        </TouchableOpacity>
                    </View>
                </View>

                <FlashList
                    data={activeTab === 'UPCOMING' ? upcoming : past}
                    keyExtractor={(item) => String(item.appointment_id)}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    ListHeaderComponent={
                        <View className="mb-3">
                            <View className="flex-row bg-white rounded-2xl p-1 border border-gray-200">
                                <TouchableOpacity
                                    onPress={() => setActiveTab('UPCOMING')}
                                    className={`flex-1 py-2 rounded-2xl items-center ${activeTab === 'UPCOMING' ? 'bg-blue-600' : 'bg-transparent'}`}
                                >
                                    <Text className={`${activeTab === 'UPCOMING' ? 'text-white' : 'text-gray-600'} font-semibold`}>
                                        Upcoming ({upcoming.length})
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setActiveTab('PAST')}
                                    className={`flex-1 py-2 rounded-2xl items-center ${activeTab === 'PAST' ? 'bg-blue-600' : 'bg-transparent'}`}
                                >
                                    <Text className={`${activeTab === 'PAST' ? 'text-white' : 'text-gray-600'} font-semibold`}>
                                        Past ({past.length})
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const isPast = item.ts < now;
                        const isMenuOpen = openCardMenuId === item.appointment_id;
                        const canCancel = !isPast && item.status !== 'CANCELLED' && item.status !== 'COMPLETED';
                        const relationTypeFromName = (() => {
                            const itemName = normalizeName(item.patient?.full_name);
                            if (!itemName) return undefined;
                            const otherName = normalizeName(otherPatientName);
                            const selfName = normalizeName(patientName);
                            if (otherName && itemName === otherName) return 'OTHER';
                            if (selfName && itemName === selfName) return 'SELF';
                            return undefined;
                        })();
                        const effectiveRelationType =
                            relationTypeFromName ||
                            (item.relation_type === 'OTHER' || item.relation_type === 'SELF' ? item.relation_type : undefined);
                        return (
                            <View className={`rounded-2xl mb-3 px-3.5 py-3 ${isPast ? 'bg-gray-50 border border-gray-200' : 'bg-white border border-blue-100'}`}>
                                <View className="flex-row items-start">
                                    <View className="bg-blue-100 w-10 h-10 rounded-xl items-center justify-center mr-3 overflow-hidden">
                                        {item.doctor?.profile_pic_url ? (
                                            <Image
                                                source={{ uri: item.doctor.profile_pic_url }}
                                                className="w-10 h-10"
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <User size={16} color="#1d4ed8" />
                                        )}
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-gray-900 font-bold text-sm" numberOfLines={1}>
                                            {formatDoctorName(item.doctor?.doctor_name)}
                                        </Text>
                                        <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                                            {item.clinic?.clinic_name || 'Clinic'}
                                        </Text>
                                        <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
                                            <View className="self-start px-2 py-1 rounded-md bg-gray-100">
                                                <Text className="text-[10px] text-gray-600">
                                                    Appointment No. <Text className="font-bold text-gray-800">{item.booking_id ?? item.patient?.booking_id ?? item.appointment_id}</Text>
                                                </Text>
                                            </View>
                                            {hasOtherContext ? (
                                                <View className={`self-start px-2.5 py-1 rounded-full ${effectiveRelationType === 'OTHER' ? 'bg-amber-50 border border-amber-200' : 'bg-sky-50 border border-sky-200'}`}>
                                                    <Text className={`text-[10px] font-semibold ${effectiveRelationType === 'OTHER' ? 'text-amber-700' : 'text-sky-700'}`}>
                                                        {getRelationBadgeText(item, effectiveRelationType)}
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </View>
                                    <View className="items-end ml-2">
                                        <View className={`px-2 py-1 rounded-md ${isPast ? 'bg-gray-200' : item.status === 'CANCELLED' ? 'bg-red-100' : item.status === 'COMPLETED' ? 'bg-green-100' : 'bg-blue-100'}`}>
                                            <Text className={`text-[10px] font-bold uppercase ${isPast ? 'text-gray-600' : item.status === 'CANCELLED' ? 'text-red-600' : item.status === 'COMPLETED' ? 'text-green-700' : 'text-blue-700'}`}>{item.status || 'BOOKED'}</Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setOpenCardMenuId((prev) => (prev === item.appointment_id ? null : item.appointment_id))}
                                            className="mt-2 p-1.5 rounded-lg bg-gray-100"
                                        >
                                            {isMenuOpen ? <X size={14} color="#4b5563" /> : <MoreVertical size={14} color="#4b5563" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View className="mt-3 flex-row">
                                    <View className="flex-1 bg-blue-50 rounded-xl px-3 py-2 mr-2">
                                        <Text className="text-[10px] uppercase tracking-wide text-blue-500 font-bold">Date</Text>
                                        <Text className="text-xs font-semibold text-blue-900 mt-0.5">{formatDateOnly(item.appointment_date)}</Text>
                                    </View>
                                    <View className="flex-1 bg-emerald-50 rounded-xl px-3 py-2 ml-2">
                                        <Text className="text-[10px] uppercase tracking-wide text-emerald-600 font-bold">Time</Text>
                                        <Text className="text-xs font-semibold text-emerald-900 mt-0.5">{formatTimeOnly(item.start_time)}</Text>
                                    </View>
                                </View>

                                {isMenuOpen && (
                                    <View
                                        className="absolute top-12 right-3 w-48 bg-white rounded-xl border border-gray-200 overflow-hidden"
                                        style={{ zIndex: 60, elevation: 10 }}
                                    >
                                        {canCancel && (
                                            <TouchableOpacity
                                                onPress={() => { setOpenCardMenuId(null); handleReschedule(item); }}
                                                className="px-4 py-3 border-b border-gray-100"
                                            >
                                                <Text className="text-sm text-gray-800 font-medium">Reschedule</Text>
                                            </TouchableOpacity>
                                        )}
                                        {canCancel && (
                                            <TouchableOpacity
                                                disabled={cancelling}
                                                onPress={() => { setOpenCardMenuId(null); cancelBooking(item); }}
                                                className="px-4 py-3 border-b border-gray-100"
                                            >
                                                <Text className="text-sm text-red-600 font-medium">{cancelling ? 'Cancelling...' : 'Cancel Appointment'}</Text>
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            onPress={() => setOpenCardMenuId(null)}
                                            className="px-4 py-3"
                                        >
                                            <Text className="text-sm text-gray-500 font-medium">Close</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Text className="text-gray-500">
                                {activeTab === 'UPCOMING' ? 'No upcoming appointments' : 'No past appointments'}
                            </Text>
                        </View>
                    }
                />
            </View>

            <Modal visible={open} transparent animationType="slide" onRequestClose={handleCloseModal}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[86%]">
                        <Text className="text-2xl font-bold text-gray-800 mb-4">
                            {selectedAppointment ? 'Reschedule Slot' : 'Book Slot'}
                        </Text>
                        <ScrollView>
                            <View className="space-y-4">
                                {!selectedAppointment && (
                                    <View>
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Booking For</Text>
                                        <View className="flex-row gap-2">
                                            {(['SELF', 'OTHER'] as BookingFor[]).map((value) => {
                                                const active = form.booking_for === value;
                                                const hasExistingProfile = value === 'SELF' ? Boolean(patientName.trim()) : Boolean(otherPatientName.trim());
                                                return (
                                                    <TouchableOpacity
                                                        key={value}
                                                        onPress={() => setForm((prev) => ({
                                                            ...prev,
                                                            booking_for: value,
                                                            patient_name: value === 'OTHER' ? otherPatientName : patientName,
                                                        }))}
                                                        className={`flex-1 rounded-xl border px-4 py-3 items-center ${active ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
                                                    >
                                                        <Text className={`font-semibold text-sm ${active ? 'text-blue-700' : 'text-gray-600'}`}>
                                                            {value === 'SELF' ? 'Self' : 'Other'}
                                                        </Text>
                                                        <Text className="text-[10px] text-gray-400 mt-1">
                                                            {hasExistingProfile ? 'Existing profile' : 'Create on first booking'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}

                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Patient Name</Text>
                                    <TextInput
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                        placeholder={form.booking_for === 'OTHER' ? 'Enter other patient name' : 'Self profile name'}
                                        value={form.patient_name}
                                        onChangeText={(text) => setForm((prev) => ({ ...prev, patient_name: text }))}
                                        editable={selectedAppointment ? false : (form.booking_for === 'OTHER' ? !Boolean(otherPatientName.trim()) : false)}
                                    />
                                    {selectedAppointment ? (
                                        <Text className="text-xs text-gray-400 mt-2">Relation is fixed for existing appointments.</Text>
                                    ) : form.booking_for === 'SELF' ? (
                                        <Text className="text-xs text-gray-400 mt-2">Self name comes from your profile settings.</Text>
                                    ) : otherPatientName.trim() ? (
                                        <Text className="text-xs text-gray-400 mt-2">Other profile already exists for this number, so the name is locked.</Text>
                                    ) : (
                                        <Text className="text-xs text-gray-400 mt-2">Enter the other patient name once. Next time it will auto-fill here.</Text>
                                    )}
                                </View>

                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Doctor</Text>
                                    <TouchableOpacity
                                        onPress={() => { setShowDoctorSearch(true); setSearchQuery(''); }}
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-row justify-between items-center h-[50px]"
                                    >
                                        <Text className={form.doctor_id ? "text-gray-800" : "text-gray-400"}>
                                            {form.doctor_id
                                                ? formatDoctorName(doctors.find(d => String(d.doctor_id) === form.doctor_id)?.doctor_name)
                                                : "Select a Doctor"}
                                        </Text>
                                        <Search size={16} color="#6b7280" />
                                    </TouchableOpacity>
                                </View>

                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Clinic</Text>
                                    <View className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                                        <Picker
                                            selectedValue={form.clinic_id}
                                            onValueChange={(itemValue) => setForm((p) => ({ ...p, clinic_id: itemValue, date: '', time: '' }))}
                                            style={{ color: '#374151', height: 50 }}
                                            dropdownIconColor="#6b7280"
                                            enabled={form.doctor_id !== ''}
                                        >
                                            <Picker.Item label={form.doctor_id ? "Select a Clinic" : "Select Doctor First"} value="" color="#9ca3af" />
                                            {clinics
                                                .filter((c) => !form.doctor_id || String(c?.doctor_id || '') === String(form.doctor_id))
                                                .map((c) => (
                                                    <Picker.Item key={c.clinic_id} label={c.clinic_name} value={String(c.clinic_id)} />
                                                ))}
                                        </Picker>
                                    </View>
                                </View>

                                <View>
                                    <View className="flex-row items-center justify-between mb-2">
                                        <Text className="text-sm font-bold text-gray-700">Date</Text>
                                        {form.date ? (
                                            <Text className="text-xs text-blue-600 font-semibold">{form.date}</Text>
                                        ) : null}
                                    </View>
                                    {(!form.doctor_id || !form.clinic_id) ? (
                                        <View className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 items-center">
                                            <Text className="text-gray-400 text-sm">Select doctor and clinic first</Text>
                                        </View>
                                    ) : renderCalendar()}
                                </View>

                                <View>
                                    <View className="flex-row items-center justify-between mb-2">
                                        <Text className="text-sm font-bold text-gray-700">Time Slot</Text>
                                        {form.time ? (
                                            <Text className="text-xs text-blue-600 font-semibold">
                                                Auto-assigned: {to12h(form.time)}
                                            </Text>
                                        ) : null}
                                    </View>
                                    {slots.length === 0 ? (
                                        <Text className="text-gray-400 text-sm">
                                            {form.clinic_id && form.date ? 'No slots available for this date' : 'Select doctor, clinic and date first'}
                                        </Text>
                                    ) : (() => {
                                        const toMin = (s: string) => {
                                            const [h, m] = s.split(':').map(Number);
                                            return h * 60 + (m || 0);
                                        };

                                        const sortedSlots = [...slots].sort((a, b) => toMin(a) - toMin(b));
                                        const sections = [
                                            {
                                                key: 'morning',
                                                title: 'Morning',
                                                subtitle: '12:00 AM - 11:59 AM',
                                                from: 0,
                                                to: 12 * 60 - 1,
                                                headerBg: 'bg-amber-50',
                                                headerText: 'text-amber-900',
                                                pillBg: 'bg-amber-100',
                                                pillText: 'text-amber-700',
                                            },
                                            {
                                                key: 'afternoon',
                                                title: 'Afternoon',
                                                subtitle: '12:00 PM - 4:59 PM',
                                                from: 12 * 60,
                                                to: 16 * 60 + 59,
                                                headerBg: 'bg-emerald-50',
                                                headerText: 'text-emerald-900',
                                                pillBg: 'bg-emerald-100',
                                                pillText: 'text-emerald-700',
                                            },
                                            {
                                                key: 'evening',
                                                title: 'Evening / Night',
                                                subtitle: '5:00 PM - onwards',
                                                from: 17 * 60,
                                                to: 24 * 60 - 1,
                                                headerBg: 'bg-indigo-50',
                                                headerText: 'text-indigo-900',
                                                pillBg: 'bg-indigo-100',
                                                pillText: 'text-indigo-700',
                                            },
                                        ];

                                        return (
                                            <View>
                                                {sections.map((section) => {
                                                    const sectionSlots = sortedSlots.filter((s) => {
                                                        const mins = toMin(s);
                                                        return mins >= section.from && mins <= section.to;
                                                    });
                                                    return (
                                                        <View key={section.key} className="mb-4">
                                                            <View className={`flex-row items-center justify-between mb-2 rounded-2xl px-3 py-2 border border-gray-100 ${section.headerBg}`}>
                                                                <View>
                                                                    <Text className={`text-sm font-bold ${section.headerText}`}>{section.title}</Text>
                                                                    <Text className="text-[11px] text-gray-500">{section.subtitle}</Text>
                                                                </View>
                                                                <View className={`rounded-full px-2.5 py-1 ${section.pillBg}`}>
                                                                    <Text className={`text-[11px] font-semibold ${section.pillText}`}>
                                                                        {sectionSlots.length} slot{sectionSlots.length !== 1 ? 's' : ''}
                                                                    </Text>
                                                                </View>
                                                            </View>

                                                            {sectionSlots.length === 0 ? (
                                                                <Text className="text-xs text-gray-400">No slots available</Text>
                                                            ) : (
                                                                <View className="flex-row flex-wrap">
                                                                    {sectionSlots.map((s) => {
                                                                        const isSelected = form.time === s;
                                                                        return (
                                                                            <TouchableOpacity
                                                                                key={`${section.key}-${s}`}
                                                                                onPress={() => setForm(p => ({ ...p, time: s }))}
                                                                                className={`mr-2 mb-2 rounded-full border px-3 py-2
                                                                                    ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                                                                            >
                                                                                <Text className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                                                                                    {to12h(s)}
                                                                                </Text>
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        );
                                    })()}
                                </View>

                                <TouchableOpacity
                                    onPress={submitBooking}
                                    disabled={booking}
                                    className={`rounded-2xl py-4 items-center mt-2 ${booking ? 'bg-blue-300' : 'bg-blue-600'}`}
                                >
                                    {booking ? <ActivityIndicator color="#fff" /> : (
                                        <Text className="text-white font-bold text-lg">
                                            {selectedAppointment ? 'Confirm Reschedule' : 'Book Appointment'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleCloseModal} className="rounded-2xl py-4 items-center mt-2 bg-gray-100">
                                    <Text className="text-gray-700 font-semibold">Close</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Doctor Search Modal */}
            <Modal visible={showDoctorSearch} transparent animationType="slide" onRequestClose={() => setShowDoctorSearch(false)}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[80%]">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-xl font-bold text-gray-800">Select Doctor</Text>
                            <TouchableOpacity onPress={() => setShowDoctorSearch(false)} className="bg-gray-100 p-2 rounded-full">
                                <X size={20} color="#4b5563" />
                            </TouchableOpacity>
                        </View>

                        <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 flex-row items-center mb-4">
                            <Search size={18} color="#9ca3af" />
                            <TextInput
                                className="flex-1 ml-2 text-gray-800 h-10"
                                placeholder="Search doctor or specialization..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <X size={16} color="#9ca3af" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <ScrollView className="mt-2 text-gray-800">
                            {filteredDoctors.length === 0 ? (
                                <View className="py-8 items-center">
                                    <Text className="text-gray-500 text-center">No doctors found matching "{searchQuery}"</Text>
                                </View>
                            ) : (
                                filteredDoctors.map((item) => (
                                    <TouchableOpacity
                                        key={item.doctor_id}
                                        onPress={() => {
                                            setForm((p) => ({ ...p, doctor_id: String(item.doctor_id), clinic_id: '', date: '', time: '' }));
                                            setShowDoctorSearch(false);
                                        }}
                                        className="py-4 border-b border-gray-100 flex-row items-center"
                                    >
                                        <View className="bg-blue-50 w-10 h-10 rounded-full items-center justify-center mr-3 overflow-hidden">
                                            {item.profile_pic_url ? (
                                                <Image
                                                    source={{ uri: item.profile_pic_url }}
                                                    className="w-10 h-10"
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <User size={18} color="#1d4ed8" />
                                            )}
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-gray-800 font-semibold text-base">
                                                {formatDoctorName(item.doctor_name)}
                                            </Text>
                                            <View className="mt-1 self-start bg-emerald-100 rounded-full px-2 py-0.5">
                                                <Text className="text-[10px] text-emerald-700 font-semibold">
                                                    {item.specialization || 'General'}
                                                </Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
