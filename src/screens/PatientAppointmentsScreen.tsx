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
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { CalendarPlus, Clock3, History, User, MoreVertical, Search, X } from 'lucide-react-native';
import { getPatientAppointments, createPatientAppointment, updatePatientAppointment } from '../api/patientAppointments';
import { getPatientProfile } from '../api/auth';
import { getClinics } from '../api/clinics';
import { getSlots } from '../api/slots';
import { getAllDoctors } from '../api/doctors';

type AppointmentItem = {
    appointment_id: number;
    appointment_date: string;
    start_time: string;
    status: string;
    doctor?: { doctor_id: number; doctor_name?: string | null };
    clinic?: { clinic_id: number; clinic_name?: string | null };
};

const toYMD = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const toHM = (value?: string) => {
    if (!value) return '';
    if (String(value).includes(':') && String(value).length <= 5) return String(value).slice(0, 5);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const to12h = (time?: string) => {
    if (!time) return '';
    const [h, m] = time.split(':');
    if (!h || !m) return time;
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
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

export default function PatientAppointmentsScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [items, setItems] = useState<AppointmentItem[]>([]);
    const [patientName, setPatientName] = useState('');
    const [doctors, setDoctors] = useState<Array<{ doctor_id: number; doctor_name: string }>>([]);
    const [clinics, setClinics] = useState<any[]>([]);
    const [slots, setSlots] = useState<string[]>([]);
    const [slotDuration, setSlotDuration] = useState(30);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [booking, setBooking] = useState(false);
    const [open, setOpen] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState<AppointmentItem | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showDoctorSearch, setShowDoctorSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [form, setForm] = useState({
        doctor_id: '',
        clinic_id: '',
        date: '',
        time: '',
    });

    const loadAll = async () => {
        const [apptsRes, profileRes, clinicsRes, doctorsRes] = await Promise.all([
            getPatientAppointments(),
            getPatientProfile().catch(() => null),
            getClinics().catch(() => ({ clinics: [] })),
            getAllDoctors().catch(() => ({ doctors: [] })),
        ]);

        const appts = (apptsRes?.appointments || []) as AppointmentItem[];
        setItems(appts);
        setPatientName(profileRes?.patient?.full_name || '');

        const ds = ((doctorsRes?.doctors || []) as any[])
            .filter((d) => d?.doctor_id)
            .map((d) => ({ doctor_id: d.doctor_id, doctor_name: d.doctor_name || 'Doctor' }));
        setDoctors(ds);

        const cs = (clinicsRes?.clinics || []).filter((c: any) => {
            if (!form.doctor_id) return true;
            if (!c?.doctor_id) return true;
            return String(c.doctor_id) === String(form.doctor_id);
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
            setExpandedGroup(null);
            return;
        }
        getSlots(form.date, Number(form.clinic_id), form.doctor_id ? Number(form.doctor_id) : undefined)
            .then((res) => {
                setSlots(res?.slots || []);
                if (res?.slot_duration) setSlotDuration(Number(res.slot_duration));
            })
            .catch(() => setSlots([]));
    }, [form.date, form.clinic_id, form.doctor_id]);

    useEffect(() => {
        if (!form.doctor_id) return;
        setClinics((prev) => prev.filter((c) => !c?.doctor_id || String(c.doctor_id) === String(form.doctor_id)));
    }, [form.doctor_id]);

    const now = Date.now();
    const withTs = (a: AppointmentItem) => {
        const ymd = toYMD(a.appointment_date);
        const hm = toHM(a.start_time);
        const ts = ymd && hm ? new Date(`${ymd}T${hm}:00`).getTime() : 0;
        return { ...a, ts };
    };

    const upcoming = useMemo(() => items.map(withTs).filter((a: any) => a.ts >= now).sort((a: any, b: any) => a.ts - b.ts), [items, now]);
    const past = useMemo(() => items.map(withTs).filter((a: any) => a.ts < now).sort((a: any, b: any) => b.ts - a.ts), [items, now]);

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
        setBooking(true);
        try {
            if (selectedAppointment) {
                await updatePatientAppointment({
                    appointmentId: selectedAppointment.appointment_id,
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
                    patient_name: patientName,
                });
                Alert.alert('Success', 'Appointment booked');
            }
            setOpen(false);
            setForm({ doctor_id: '', clinic_id: '', date: '', time: '' });
            setSelectedAppointment(null);
            await loadAll();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to process appointment');
        } finally {
            setBooking(false);
        }
    };

    const cancelBooking = async (appointmentId: number) => {
        Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes, Cancel',
                style: 'destructive',
                onPress: async () => {
                    setLoading(true);
                    try {
                        await updatePatientAppointment({
                            appointmentId,
                            status: 'CANCELLED',
                            cancelled_by: 'PATIENT',
                        });
                        Alert.alert('Success', 'Appointment cancelled');
                        await loadAll();
                    } catch (error: any) {
                        Alert.alert('Error', error?.response?.data?.error || 'Failed to cancel appointment');
                        setLoading(false);
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
        });
        setOpen(true);
    };

    const handleCloseModal = () => {
        setOpen(false);
        setSelectedAppointment(null);
        setForm({ doctor_id: '', clinic_id: '', date: '', time: '' });
        setShowDoctorSearch(false);
        setSearchQuery('');
    };

    const filteredDoctors = useMemo(() => {
        if (!searchQuery.trim()) return doctors;
        const q = searchQuery.toLowerCase();
        return doctors.filter(d => d.doctor_name.toLowerCase().includes(q));
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
                        <TouchableOpacity onPress={() => { setSelectedAppointment(null); setForm({ doctor_id: '', clinic_id: '', date: '', time: '' }); setOpen(true); }} className="bg-white rounded-full p-3">
                            <CalendarPlus size={20} color="#1d4ed8" />
                        </TouchableOpacity>
                    </View>
                </View>

                <FlashList
                    data={[...upcoming, ...past]}
                    keyExtractor={(item) => String(item.appointment_id)}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    ListHeaderComponent={
                        <View className="mb-3">
                            <Text className="text-gray-700 font-bold">Upcoming: {upcoming.length} • Past: {past.length}</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const isPast = item.ts < now;
                        return (
                            <View className={`rounded-2xl p-4 mb-3 border ${isPast ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-100'}`}>
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-1">
                                        <Text className="text-gray-900 font-bold">{item.clinic?.clinic_name || 'Clinic'}</Text>
                                    </View>
                                    <View className="flex-row items-center">
                                        <Text className={`text-xs font-semibold mr-2 ${isPast ? 'text-gray-500' : 'text-blue-700'}`}>{item.status || 'BOOKED'}</Text>
                                        {!isPast && item.status !== 'CANCELLED' && (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    Alert.alert(
                                                        'Options',
                                                        'What would you like to do?',
                                                        [
                                                            { text: 'Reschedule', onPress: () => handleReschedule(item) },
                                                            { text: 'Cancel', onPress: () => cancelBooking(item.appointment_id), style: 'destructive' },
                                                            { text: 'Close', style: 'cancel' }
                                                        ]
                                                    );
                                                }}
                                            >
                                                <MoreVertical size={18} color="#6b7280" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-row items-center mt-2">
                                        <User size={14} color="#6b7280" />
                                        <Text className="text-gray-600 text-sm ml-2">{item.doctor?.doctor_name || 'Doctor'}</Text>
                                    </View>
                                    <View className="flex-row items-center mt-1">
                                        <Clock3 size={14} color="#6b7280" />
                                        <Text className="text-gray-600 text-sm ml-2">{formatWhen(item.appointment_date, item.start_time)}</Text>
                                    </View>
                                </View>
                                {isPast ? (
                                    <View className="mt-2 self-start bg-gray-200 rounded-full px-2 py-1 flex-row items-center">
                                        <History size={11} color="#4b5563" />
                                        <Text className="text-gray-700 text-[11px] font-semibold ml-1">Past</Text>
                                    </View>
                                ) : null}
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Text className="text-gray-500">No appointments yet</Text>
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
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Doctor</Text>
                                    <TouchableOpacity
                                        onPress={() => { setShowDoctorSearch(true); setSearchQuery(''); }}
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-row justify-between items-center h-[50px]"
                                    >
                                        <Text className={form.doctor_id ? "text-gray-800" : "text-gray-400"}>
                                            {form.doctor_id
                                                ? doctors.find(d => String(d.doctor_id) === form.doctor_id)?.doctor_name || 'Select a Doctor'
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
                                                .filter((c) => !form.doctor_id || !c?.doctor_id || String(c.doctor_id) === String(form.doctor_id))
                                                .map((c) => (
                                                    <Picker.Item key={c.clinic_id} label={c.clinic_name} value={String(c.clinic_id)} />
                                                ))}
                                        </Picker>
                                    </View>
                                </View>

                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Date</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowDatePicker(true)}
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
                                    >
                                        <Text className={form.date ? "text-gray-800" : "text-gray-400"}>
                                            {form.date || "Select Date"}
                                        </Text>
                                    </TouchableOpacity>
                                    {showDatePicker && (
                                        <DateTimePicker
                                            value={form.date ? new Date(form.date) : new Date()}
                                            mode="date"
                                            display="default"
                                            minimumDate={new Date()}
                                            onChange={(event, selectedDate) => {
                                                setShowDatePicker(Platform.OS === 'ios');
                                                if (selectedDate) {
                                                    const y = selectedDate.getFullYear();
                                                    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                                    const d = String(selectedDate.getDate()).padStart(2, '0');
                                                    setForm((p) => ({ ...p, date: `${y}-${m}-${d}`, time: '' }));
                                                }
                                            }}
                                        />
                                    )}
                                </View>

                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Time Slot</Text>
                                    {slots.length === 0 ? (
                                        <Text className="text-gray-400">
                                            {form.clinic_id && form.date ? 'No slots available' : 'Select doctor, clinic and date'}
                                        </Text>
                                    ) : (() => {
                                        // Group size: 30 min if slot_duration<=30, else 60 min
                                        const groupMin = slotDuration <= 30 ? 30 : 60;

                                        // Convert "HH:MM" to total minutes
                                        const toMin = (s: string) => {
                                            const [h, m] = s.split(':').map(Number);
                                            return h * 60 + (m || 0);
                                        };

                                        // Build groups: key = start-of-group in "HH:MM", value = slots[]
                                        const groupMap = new Map<string, string[]>();
                                        slots.forEach(s => {
                                            const mins = toMin(s);
                                            const groupStart = Math.floor(mins / groupMin) * groupMin;
                                            const gh = String(Math.floor(groupStart / 60)).padStart(2, '0');
                                            const gm = String(groupStart % 60).padStart(2, '0');
                                            const key = `${gh}:${gm}`;
                                            if (!groupMap.has(key)) groupMap.set(key, []);
                                            groupMap.get(key)!.push(s);
                                        });

                                        const groupLabel = (key: string) => {
                                            const [h, m] = key.split(':').map(Number);
                                            const endMins = h * 60 + m + groupMin;
                                            const eh = Math.floor(endMins / 60) % 24;
                                            const em = endMins % 60;
                                            const fmt = (hr: number, mn: number) => {
                                                const ampm = hr >= 12 ? 'PM' : 'AM';
                                                return `${hr % 12 || 12}:${String(mn).padStart(2, '0')} ${ampm}`;
                                            };
                                            return `${fmt(h, m)} – ${fmt(eh, em)}`;
                                        };

                                        return (
                                            <View>
                                                {[...groupMap.entries()].map(([key, groupSlots]) => {
                                                    const isExpanded = expandedGroup === key;
                                                    const groupSelected = groupSlots.some(s => form.time === s);
                                                    return (
                                                        <View key={key} className="mb-2">
                                                            {/* Group header chip */}
                                                            <TouchableOpacity
                                                                onPress={() => setExpandedGroup(isExpanded ? null : key)}
                                                                className={`flex-row items-center justify-between rounded-xl border px-4 py-2.5 ${groupSelected
                                                                        ? 'bg-blue-50 border-blue-400'
                                                                        : 'bg-white border-gray-200'
                                                                    }`}
                                                            >
                                                                <Text className={`font-semibold text-sm ${groupSelected ? 'text-blue-700' : 'text-gray-700'
                                                                    }`}>
                                                                    {groupLabel(key)}
                                                                </Text>
                                                                <View className="flex-row items-center">
                                                                    <Text className="text-xs text-gray-400 mr-2">
                                                                        {groupSlots.length} slot{groupSlots.length > 1 ? 's' : ''}
                                                                    </Text>
                                                                    <Text className="text-gray-400">{isExpanded ? '▲' : '▼'}</Text>
                                                                </View>
                                                            </TouchableOpacity>

                                                            {/* Individual slots inside the group */}
                                                            {isExpanded && (
                                                                <View className="flex-row flex-wrap mt-1.5 ml-2">
                                                                    {groupSlots.map(s => {
                                                                        const sel = form.time === s;
                                                                        return (
                                                                            <TouchableOpacity
                                                                                key={s}
                                                                                onPress={() => setForm(p => ({ ...p, time: s }))}
                                                                                className={`mr-2 mb-2 rounded-xl border px-3 py-1.5 ${sel ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'
                                                                                    }`}
                                                                            >
                                                                                <Text className={`text-xs font-semibold ${sel ? 'text-white' : 'text-gray-700'
                                                                                    }`}>{to12h(s)}</Text>
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
                                placeholder="Search doctor name..."
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
                                        <View className="bg-blue-50 w-10 h-10 rounded-full items-center justify-center mr-3">
                                            <User size={18} color="#1d4ed8" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-gray-800 font-semibold text-base">{item.doctor_name}</Text>
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

