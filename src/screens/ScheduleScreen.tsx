import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    ActivityIndicator,
    StatusBar,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Modal,
    ScrollView,
    TextInput,
    Alert,
} from 'react-native';
import {
    CalendarDays,
    Timer,
    Calendar,
    Plus,
    X,
    Layers,
    Pencil,
    Trash2,
    Clock,
    MoreVertical,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSchedule, createSchedule, updateSchedule, deleteSchedule } from '../api/schedule';
import { getClinics } from '../api/clinics';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_SHORT: Record<string, string> = {
    monday: 'MON', tuesday: 'TUE', wednesday: 'WED',
    thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN',
};

const DAY_FULL: Record<string, string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

const DAY_NUMBER_TO_KEY: Record<number, string> = {
    1: 'monday', 2: 'tuesday', 3: 'wednesday',
    4: 'thursday', 5: 'friday', 6: 'saturday', 0: 'sunday',
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const normalizeDayNumber = (day: number): number => (day === 7 ? 0 : day);

const timeToMinutes = (value?: string): number => {
    if (!value) return 0;
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    const h = Number(match[1]);
    const m = Number(match[2]);
    return Number.isNaN(h) || Number.isNaN(m) ? 0 : h * 60 + m;
};

const formatTime = (value?: string): string => {
    if (!value) return 'N/A';
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return String(value);
    let hour = Number(match[1]);
    const minute = match[2];
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${meridiem}`;
};

const parse24Hour = (value?: string): { hour12: number; minute: string; period: 'AM' | 'PM' } => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return { hour12: 9, minute: '00', period: 'AM' };
    let hour24 = Number(match[1]);
    const minute = match[2];
    const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
    hour24 = hour24 % 12 || 12;
    return { hour12: hour24, minute, period };
};

const to24Hour = (hour12: number, minute: string, period: 'AM' | 'PM'): string => {
    let hour24 = hour12 % 12;
    if (period === 'PM') hour24 += 12;
    return `${String(hour24).padStart(2, '0')}:${minute}`;
};

const normalizeClinicName = (name?: string): string =>
    String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleItem {
    schedule_id: number;
    day_of_week: number;
    clinic_id: number;
    clinic: { clinic_name: string };
    start_time: string;
    end_time: string;
    slot_duration: number;
    effective_from: string;
    effective_to: string;
}

interface GroupedSchedule {
    groupKey: string;
    dayNumber: number;
    dayKey: string;
    dayShort: string;
    dayFull: string;
    clinicName: string;
    slots: ScheduleItem[];
}

interface FormSlot {
    local_id: string;
    schedule_id?: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    slot_duration: string;
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

const groupSchedules = (schedules: ScheduleItem[]): GroupedSchedule[] => {
    const map = new Map<string, GroupedSchedule>();

    schedules.forEach(item => {
        const normalizedDay = normalizeDayNumber(Number(item.day_of_week));
        const dayKey = DAY_NUMBER_TO_KEY[normalizedDay] ?? 'monday';
        const clinicId = Number(item.clinic_id);
        const clinicNameNorm = normalizeClinicName(item.clinic?.clinic_name);
        const clinicLabel = (item.clinic?.clinic_name || '').trim() || (clinicId ? `Clinic ${clinicId}` : 'Unknown Clinic');
        const clinicIdentity = clinicId > 0 ? `id:${clinicId}` : `name:${clinicNameNorm || 'unknown'}`;
        const groupKey = `${normalizedDay}__${clinicIdentity}`;

        if (!map.has(groupKey)) {
            map.set(groupKey, {
                groupKey, dayNumber: normalizedDay, dayKey,
                dayShort: DAY_SHORT[dayKey] ?? '???',
                dayFull: DAY_FULL[dayKey] ?? dayKey,
                clinicName: clinicLabel, slots: [],
            });
        }

        const group = map.get(groupKey)!;
        const alreadyExists = group.slots.some(s => Number(s.schedule_id) === Number(item.schedule_id));
        if (!alreadyExists) group.slots.push({ ...item, day_of_week: normalizedDay });
    });

    return Array.from(map.values())
        .map(group => ({
            ...group,
            slots: [...group.slots].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)),
        }))
        .sort((a, b) => {
            const dc = DAY_ORDER.indexOf(a.dayNumber) - DAY_ORDER.indexOf(b.dayNumber);
            return dc !== 0 ? dc : a.clinicName.localeCompare(b.clinicName);
        });
};

// ─── Animated wrapper ─────────────────────────────────────────────────────────

const AnimatedListItem = ({ children, index, style }: { children: React.ReactNode; index: number; style?: any }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY }] }, style]}>
            {children}
        </Animated.View>
    );
};

// ─── Slot Options Popup ───────────────────────────────────────────────────────

interface SlotOptionsPopupProps {
    visible: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

const SlotOptionsPopup = ({ visible, onClose, onEdit, onDelete }: SlotOptionsPopupProps) => {
    const scaleAnim = useRef(new Animated.Value(0.85)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }),
                Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
            ]).start();
        } else {
            scaleAnim.setValue(0.85);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <TouchableWithoutFeedback onPress={onClose}>
            <View className="absolute inset-0 z-100" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                <Animated.View
                    style={{
                        opacity: opacityAnim,
                        transform: [{ scale: scaleAnim }],
                        position: 'absolute',
                        right: 36,
                        top: 4,
                        backgroundColor: 'white',
                        borderRadius: 12,
                        shadowColor: '#6d28d9',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 12,
                        elevation: 8,
                        minWidth: 140,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: '#ede9fe',
                        zIndex: 100,
                    }}
                >
                    <TouchableOpacity
                        onPress={() => { onClose(); onEdit(); }}
                        className="flex-row items-center px-4 py-3 border-b border-violet-50"
                        activeOpacity={0.7}
                    >
                        <View className="w-7 h-7 rounded-lg bg-violet-50 items-center justify-center mr-3">
                            <Pencil size={13} color="#6d28d9" />
                        </View>
                        <Text className="text-violet-800 font-semibold text-sm">Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => { onClose(); onDelete(); }}
                        className="flex-row items-center px-4 py-3"
                        activeOpacity={0.7}
                    >
                        <View className="w-7 h-7 rounded-lg bg-red-50 items-center justify-center mr-3">
                            <Trash2 size={13} color="#ef4444" />
                        </View>
                        <Text className="text-red-500 font-semibold text-sm">Delete</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </TouchableWithoutFeedback>
    );
};

// ─── Slot Row ─────────────────────────────────────────────────────────────────

const SlotRow = ({
    slot, isLast, onEdit, onDelete, index,
}: {
    slot: ScheduleItem;
    isLast: boolean;
    onEdit: (slot: ScheduleItem) => void;
    onDelete: (slot: ScheduleItem) => void;
    index: number;
}) => {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <View style={{ zIndex: 100 - index }}>
            <View className="flex-row items-center px-4 py-3 pb-2 pt-3">
                {/* Time info */}
                <View className="flex-row items-center flex-1">
                    <Clock size={12} color="#8b5cf6" style={{ marginRight: 6 }} />
                    <View className="bg-violet-50 px-2.5 py-1 rounded-lg">
                        <Text className="text-violet-700 font-bold text-sm">{formatTime(slot.start_time)}</Text>
                    </View>
                    <View className="mx-2 h-px w-3 bg-gray-300" />
                    <View className="bg-violet-50 px-2.5 py-1 rounded-lg">
                        <Text className="text-violet-700 font-bold text-sm">{formatTime(slot.end_time)}</Text>
                    </View>
                </View>

                {/* Duration badge */}
                <View className="flex-row items-center bg-gray-100 px-2 py-1 rounded-lg mr-2">
                    <Timer size={10} color="#9ca3af" style={{ marginRight: 3 }} />
                    <Text className="text-gray-400 text-xs font-semibold">{slot.slot_duration}m</Text>
                </View>

                {/* Three-dot menu button */}
                <TouchableOpacity
                    onPress={() => setMenuOpen(prev => !prev)}
                    className="w-8 h-8 items-center justify-center rounded-lg bg-gray-50 border border-gray-100"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <MoreVertical size={16} color="#6b7280" />
                </TouchableOpacity>
            </View>

            {/* Popup menu */}
            {menuOpen && (
                <SlotOptionsPopup
                    visible={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    onEdit={() => onEdit(slot)}
                    onDelete={() => onDelete(slot)}
                />
            )}

            {!isLast && <View className="mx-3 h-px bg-gray-100" />}
        </View>
    );
};

// ─── Group Card ───────────────────────────────────────────────────────────────

const GroupCard = ({
    group, index, onEditSlot, onDeleteSlot,
}: {
    group: GroupedSchedule;
    index: number;
    onEditSlot: (slot: ScheduleItem) => void;
    onDeleteSlot: (slot: ScheduleItem) => void;
}) => (
    <AnimatedListItem index={index} style={{ zIndex: 1000 - index }}>
        <View
            className="bg-white rounded-2xl mb-2.5 border border-violet-100"
            style={{ zIndex: 1000 - index, shadowColor: '#845ac9', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 }}
        >
            {/* Card Header */}
            <View className="flex-row items-center px-3 py-2.5 bg-violet-50 border-b border-violet-100 rounded-t-2xl">
                <View className="bg-violet-600 px-2 py-1 rounded-lg mr-2.5">
                    <Text className="text-white font-black text-xs tracking-wider">{group.dayShort}</Text>
                </View>
                <View className="flex-1">
                    <Text className="text-violet-900 font-bold text-sm">{group.dayFull}</Text>
                    <View className="flex-row items-center mt-0.5">
                        <CalendarDays size={10} color="#8b5cf6" style={{ marginRight: 3 }} />
                        <Text className="text-violet-400 text-xs" numberOfLines={1}>{group.clinicName}</Text>
                    </View>
                </View>
                <View className="flex-row items-center bg-violet-100 px-2 py-1 rounded-lg">
                    <Layers size={10} color="#7c3aed" style={{ marginRight: 3 }} />
                    <Text className="text-violet-600 font-bold text-xs">{group.slots.length}</Text>
                </View>
            </View>

            <View className="pt-0.5">
                {group.slots.map((slot, i) => (
                    <SlotRow
                        key={slot.schedule_id}
                        slot={slot}
                        index={i}
                        isLast={i === group.slots.length - 1}
                        onEdit={onEditSlot}
                        onDelete={onDeleteSlot}
                    />
                ))}
            </View>
        </View>
    </AnimatedListItem>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const ScheduleScreen = () => {
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [grouped, setGrouped] = useState<GroupedSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
    const [clinics, setClinics] = useState<any[]>([]);
    const [scheduleForm, setScheduleForm] = useState({ clinic_id: '' });
    const [formSlots, setFormSlots] = useState<FormSlot[]>([
        { local_id: `slot-${Date.now()}`, day_of_week: '1', start_time: '09:00', end_time: '17:00', slot_duration: '30' },
    ]);
    const [timePickerVisible, setTimePickerVisible] = useState(false);
    const [timePickerTarget, setTimePickerTarget] = useState<{ local_id: string; field: 'start_time' | 'end_time' } | null>(null);
    const [pickerHour, setPickerHour] = useState<number>(9);
    const [pickerMinute, setPickerMinute] = useState<string>('00');
    const [pickerPeriod, setPickerPeriod] = useState<'AM' | 'PM'>('AM');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        await Promise.all([fetchSchedule(), fetchClinics()]);
        setLoading(false);
    };

    const fetchSchedule = async () => {
        try {
            const data = await getSchedule();
            const list: ScheduleItem[] = data?.schedules || data || [];
            setSchedule(list);
            setGrouped(groupSchedules(list));
        } catch (e) { console.error(e); }
    };

    const fetchClinics = async () => {
        try {
            const data = await getClinics();
            setClinics(data.clinics || []);
            if (data.clinics?.length > 0)
                setScheduleForm(prev => ({ ...prev, clinic_id: data.clinics[0].clinic_id.toString() }));
        } catch (e) { console.error(e); }
    };

    const createEmptySlot = (seed?: Partial<FormSlot>): FormSlot => ({
        local_id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        day_of_week: seed?.day_of_week || '1',
        start_time: seed?.start_time || '09:00',
        end_time: seed?.end_time || '17:00',
        slot_duration: seed?.slot_duration || '30',
    });

    const resetForm = () => {
        setEditingScheduleId(null);
        setScheduleForm(prev => ({ clinic_id: prev.clinic_id || (clinics[0]?.clinic_id ? String(clinics[0].clinic_id) : '') }));
        setFormSlots([createEmptySlot()]);
    };

    const handleSaveSchedule = async () => {
        if (!scheduleForm.clinic_id) return Alert.alert('Error', 'Please select a clinic');
        if (formSlots.length === 0) return Alert.alert('Error', 'Please add at least one slot');
        for (const slot of formSlots) {
            if (!slot.day_of_week || !slot.start_time || !slot.end_time || !slot.slot_duration)
                return Alert.alert('Error', 'Please fill all fields for each slot');
            if (slot.start_time >= slot.end_time)
                return Alert.alert('Error', 'Start time must be earlier than end time');
        }
        setSubmitting(true);
        try {
            const payload = {
                clinicId: parseInt(scheduleForm.clinic_id),
                schedules: formSlots.map(slot => ({
                    schedule_id: slot.schedule_id,
                    day_of_week: parseInt(slot.day_of_week),
                    start_time: slot.start_time,
                    end_time: slot.end_time,
                    slot_duration: parseInt(slot.slot_duration),
                    effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                })),
            };
            editingScheduleId ? await updateSchedule(payload) : await createSchedule(payload);
            setModalVisible(false);
            resetForm();
            await fetchSchedule();
        } catch (e) {
            console.error(e);
            Alert.alert('Error', editingScheduleId ? 'Failed to update schedule' : 'Failed to create schedule');
        } finally { setSubmitting(false); }
    };

    const handleOpenAdd = () => { resetForm(); setModalVisible(true); };

    const handleEditSlot = (slot: ScheduleItem) => {
        setEditingScheduleId(Number(slot.schedule_id));
        setScheduleForm({ clinic_id: String(slot.clinic_id || '') });
        setFormSlots([{
            local_id: `slot-edit-${slot.schedule_id}`,
            schedule_id: Number(slot.schedule_id),
            day_of_week: String(normalizeDayNumber(Number(slot.day_of_week))),
            start_time: String(slot.start_time || '09:00').slice(0, 5),
            end_time: String(slot.end_time || '17:00').slice(0, 5),
            slot_duration: String(slot.slot_duration || '30'),
        }]);
        setModalVisible(true);
    };

    const handleAddFormSlot = () => {
        const last = formSlots[formSlots.length - 1];
        setFormSlots(prev => [...prev, createEmptySlot({
            day_of_week: last?.day_of_week, start_time: last?.start_time,
            end_time: last?.end_time, slot_duration: last?.slot_duration,
        })]);
    };

    const handleRemoveFormSlot = (localId: string) =>
        setFormSlots(prev => prev.length <= 1 ? prev : prev.filter(s => s.local_id !== localId));

    const handlePatchFormSlot = (localId: string, patch: Partial<FormSlot>) =>
        setFormSlots(prev => prev.map(slot => slot.local_id === localId ? { ...slot, ...patch } : slot));

    const openTimePicker = (localId: string, field: 'start_time' | 'end_time', currentValue: string) => {
        const parsed = parse24Hour(currentValue);
        setPickerHour(parsed.hour12);
        setPickerMinute(parsed.minute);
        setPickerPeriod(parsed.period);
        setTimePickerTarget({ local_id: localId, field });
        setTimePickerVisible(true);
    };

    const applyPickedTime = () => {
        if (!timePickerTarget) return;
        const normalizedHour = Math.min(12, Math.max(1, Number.isFinite(pickerHour) ? pickerHour : 9));
        const minuteNum = Math.min(59, Math.max(0, Number.parseInt(pickerMinute, 10) || 0));
        const value = to24Hour(normalizedHour, String(minuteNum).padStart(2, '0'), pickerPeriod);
        handlePatchFormSlot(timePickerTarget.local_id, { [timePickerTarget.field]: value } as Partial<FormSlot>);
        setTimePickerVisible(false);
        setTimePickerTarget(null);
    };

    const nudgePicker = (field: 'hour' | 'minute', delta: number) => {
        if (field === 'hour') { setPickerHour(((pickerHour - 1 + delta + 120) % 12) + 1); return; }
        setPickerMinute(String(((Number.parseInt(pickerMinute, 10) + delta + 600) % 60)).padStart(2, '0'));
    };

    const handleDeleteSlot = (slot: ScheduleItem) => {
        Alert.alert('Delete Schedule Slot', `Delete ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    try { await deleteSchedule(Number(slot.schedule_id)); await fetchSchedule(); }
                    catch (e) { console.error(e); Alert.alert('Error', 'Failed to delete schedule'); }
                },
            },
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-violet-50">
                <ActivityIndicator size="large" color="#7c3aed" />
                <Text className="text-violet-400 mt-3 text-sm">Loading schedule…</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-violet-600" edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#7c3aed" />
            <View className="flex-1 bg-white">

                {/* ── Header ── */}
                <View className="bg-violet-600 px-5 pt-4 pb-6 rounded-b-3xl">
                    <View className="flex-row justify-between items-center">
                        <View>
                            <Text className="text-white text-2xl font-bold">My Schedule</Text>
                            <Text className="text-violet-200 text-sm mt-0.5">
                                {schedule.length} slot{schedule.length !== 1 ? 's' : ''} · {grouped.length} group{grouped.length !== 1 ? 's' : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleOpenAdd}
                            className="bg-white w-11 h-11 rounded-full items-center justify-center"
                            style={{ shadowColor: '#4c1d95', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }}
                        >
                            <Plus size={22} color="#7c3aed" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── List ── */}
                <FlatList
                    data={grouped}
                    keyExtractor={item => item.groupKey}
                    renderItem={({ item, index }) => (
                        <GroupCard group={item} index={index} onEditSlot={handleEditSlot} onDeleteSlot={handleDeleteSlot} />
                    )}
                    contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View className="items-center mt-20">
                            <View className="w-16 h-16 rounded-full bg-violet-100 items-center justify-center mb-4">
                                <Calendar size={30} color="#c4b5fd" />
                            </View>
                            <Text className="text-gray-600 font-semibold text-base">No schedule configured</Text>
                            <Text className="text-gray-400 text-sm mt-1 text-center px-10">
                                Tap + to add your first schedule slot
                            </Text>
                        </View>
                    }
                />
            </View>

            {/* ── Add / Edit Modal ── */}
            <Modal
                animationType="slide"
                transparent
                visible={isModalVisible}
                onRequestClose={() => { setModalVisible(false); resetForm(); }}
            >
                <View className="flex-1 justify-end bg-black/40">
                    <View className="bg-white rounded-t-3xl px-5 pt-5 h-[88%]">
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-xl font-bold text-gray-800">
                                {editingScheduleId ? 'Edit Slot' : 'New Schedule Slot'}
                            </Text>
                            <TouchableOpacity
                                onPress={() => { setModalVisible(false); resetForm(); }}
                                className="bg-gray-100 p-2 rounded-full"
                            >
                                <X size={20} color="#6b7280" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>

                            {/* Clinic */}
                            <Text className="text-sm font-bold text-gray-700 mb-2">Clinic</Text>
                            <View className="flex-row flex-wrap gap-2 mb-5">
                                {clinics.map(c => {
                                    const selected = scheduleForm.clinic_id === c.clinic_id.toString();
                                    return (
                                        <TouchableOpacity
                                            key={c.clinic_id}
                                            onPress={() => setScheduleForm({ ...scheduleForm, clinic_id: c.clinic_id.toString() })}
                                            className={`px-4 py-2 rounded-xl border ${selected ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                                        >
                                            <Text className={`font-semibold text-sm ${selected ? 'text-violet-700' : 'text-gray-500'}`}>
                                                {c.clinic_name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Slots */}
                            {formSlots.map((slot, slotIndex) => (
                                <View key={slot.local_id} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-3">
                                    <View className="flex-row items-center justify-between mb-3">
                                        <Text className="text-sm font-bold text-gray-700">Slot {slotIndex + 1}</Text>
                                        {formSlots.length > 1 && (
                                            <TouchableOpacity
                                                onPress={() => handleRemoveFormSlot(slot.local_id)}
                                                className="bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg"
                                            >
                                                <Text className="text-red-400 text-xs font-semibold">Remove</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* Day of Week */}
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Day of Week</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                                        <View className="flex-row gap-2 pb-1">
                                            {([1, 2, 3, 4, 5, 6, 0] as number[]).map(day => {
                                                const key = DAY_NUMBER_TO_KEY[day];
                                                const label = DAY_SHORT[key]?.slice(0, 1) ?? String(day);
                                                const selected = slot.day_of_week === day.toString();
                                                return (
                                                    <TouchableOpacity
                                                        key={`${slot.local_id}-day-${day}`}
                                                        onPress={() => handlePatchFormSlot(slot.local_id, { day_of_week: day.toString() })}
                                                        className={`w-10 h-10 items-center justify-center rounded-full border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}
                                                    >
                                                        <Text className={`font-black text-xs ${selected ? 'text-white' : 'text-gray-400'}`}>
                                                            {label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>

                                    {/* Start / End */}
                                    <View className="flex-row gap-3 mb-3">
                                        {(['start_time', 'end_time'] as const).map(field => (
                                            <View key={field} className="flex-1">
                                                <Text className="text-sm font-bold text-gray-700 mb-1.5">
                                                    {field === 'start_time' ? 'Start' : 'End'}
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => openTimePicker(slot.local_id, field, slot[field])}
                                                    className="bg-white border border-gray-200 rounded-xl px-3 py-2.5"
                                                >
                                                    <Text className="text-gray-800 text-sm font-semibold">
                                                        {formatTime(slot[field])}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>

                                    {/* Duration */}
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Duration (mins)</Text>
                                    <View className="flex-row gap-2">
                                        {['15', '30', '45', '60'].map(dur => {
                                            const selected = slot.slot_duration === dur;
                                            return (
                                                <TouchableOpacity
                                                    key={`${slot.local_id}-dur-${dur}`}
                                                    onPress={() => handlePatchFormSlot(slot.local_id, { slot_duration: dur })}
                                                    className={`flex-1 py-2.5 items-center rounded-xl border ${selected ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-bold text-sm ${selected ? 'text-violet-700' : 'text-gray-500'}`}>
                                                        {dur}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            ))}

                            {!editingScheduleId && (
                                <TouchableOpacity
                                    onPress={handleAddFormSlot}
                                    className="border border-dashed border-violet-300 bg-violet-50 rounded-xl py-3 items-center mb-4"
                                >
                                    <Text className="text-violet-500 font-semibold text-sm">+ Add Another Slot</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                onPress={handleSaveSchedule}
                                disabled={submitting}
                                className={`bg-violet-600 rounded-2xl py-4 items-center mb-8 ${submitting ? 'opacity-60' : ''}`}
                                style={{ shadowColor: '#6d28d9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
                            >
                                {submitting
                                    ? <ActivityIndicator color="white" />
                                    : <Text className="text-white font-bold text-base">
                                        {editingScheduleId ? 'Update Schedule' : 'Save Schedule'}
                                    </Text>
                                }
                            </TouchableOpacity>

                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Time Picker Modal ── */}
            <Modal
                animationType="fade"
                transparent
                visible={timePickerVisible}
                onRequestClose={() => { setTimePickerVisible(false); setTimePickerTarget(null); }}
            >
                <View className="flex-1 justify-center items-center bg-black/40 px-5">
                    <View className="w-full bg-white rounded-2xl p-5">
                        <Text className="text-lg font-bold text-gray-800 mb-1">Select Time</Text>
                        <Text className="text-xs text-gray-400 mb-4">12-hour format</Text>

                        {/* Hour + Minute row */}
                        <View className="flex-row gap-3 mb-4">
                            <View className="flex-1">
                                <Text className="text-xs font-semibold text-gray-500 mb-1.5">Hour</Text>
                                <View className="flex-row items-center">
                                    <TouchableOpacity
                                        onPress={() => nudgePicker('hour', -1)}
                                        className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-l-xl"
                                    >
                                        <Text className="text-violet-600 font-bold">−</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={String(pickerHour)}
                                        onChangeText={t => {
                                            const n = Number.parseInt(t.replace(/[^\d]/g, ''), 10);
                                            if (!Number.isNaN(n)) setPickerHour(Math.min(12, Math.max(1, n)));
                                        }}
                                        keyboardType="number-pad"
                                        maxLength={2}
                                        className="flex-1 border-t border-b border-gray-200 text-center text-base font-bold text-gray-800 py-2"
                                    />
                                    <TouchableOpacity
                                        onPress={() => nudgePicker('hour', 1)}
                                        className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-r-xl"
                                    >
                                        <Text className="text-violet-600 font-bold">+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View className="flex-1">
                                <Text className="text-xs font-semibold text-gray-500 mb-1.5">Minute</Text>
                                <View className="flex-row items-center">
                                    <TouchableOpacity
                                        onPress={() => nudgePicker('minute', -5)}
                                        className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-l-xl"
                                    >
                                        <Text className="text-violet-600 font-bold">−</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={pickerMinute}
                                        onChangeText={t => {
                                            const n = Number.parseInt(t.replace(/[^\d]/g, ''), 10);
                                            if (Number.isNaN(n)) { setPickerMinute('00'); return; }
                                            setPickerMinute(String(Math.min(59, Math.max(0, n))).padStart(2, '0'));
                                        }}
                                        keyboardType="number-pad"
                                        maxLength={2}
                                        className="flex-1 border-t border-b border-gray-200 text-center text-base font-bold text-gray-800 py-2"
                                    />
                                    <TouchableOpacity
                                        onPress={() => nudgePicker('minute', 5)}
                                        className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-r-xl"
                                    >
                                        <Text className="text-violet-600 font-bold">+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        {/* Quick minutes */}
                        <View className="flex-row gap-2 mb-4">
                            {['00', '15', '30', '45'].map(m => {
                                const selected = pickerMinute === m;
                                return (
                                    <TouchableOpacity
                                        key={m}
                                        onPress={() => setPickerMinute(m)}
                                        className={`flex-1 py-2 items-center rounded-xl border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-500'}`}>
                                            :{m}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* AM / PM */}
                        <View className="flex-row gap-2 mb-4">
                            {(['AM', 'PM'] as const).map(p => {
                                const selected = pickerPeriod === p;
                                return (
                                    <TouchableOpacity
                                        key={p}
                                        onPress={() => setPickerPeriod(p)}
                                        className={`flex-1 py-2.5 items-center rounded-xl border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`font-bold ${selected ? 'text-white' : 'text-gray-500'}`}>{p}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Preview */}
                        <View className="bg-violet-50 border border-violet-100 rounded-xl py-2.5 mb-4 items-center">
                            <Text className="text-violet-700 font-bold text-xl tracking-widest">
                                {String(pickerHour).padStart(2, '0')}:{pickerMinute} {pickerPeriod}
                            </Text>
                        </View>

                        {/* Actions */}
                        <View className="flex-row gap-2">
                            <TouchableOpacity
                                onPress={() => { setTimePickerVisible(false); setTimePickerTarget(null); }}
                                className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                            >
                                <Text className="text-gray-500 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={applyPickedTime}
                                className="flex-1 py-3 rounded-xl bg-violet-600 items-center"
                            >
                                <Text className="text-white font-bold">Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default ScheduleScreen;