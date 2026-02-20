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
    TextInput
} from 'react-native';
import {
    CalendarDays,
    Clock,
    Timer,
    Calendar,
    Plus,
    X,
    Layers
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSchedule, createSchedule } from '../api/schedule';
import { getClinics } from '../api/clinics';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_COLORS: Record<string, string> = {
    monday: '#2563eb', tuesday: '#7c3aed', wednesday: '#0891b2',
    thursday: '#059669', friday: '#d97706', saturday: '#db2777', sunday: '#dc2626',
};

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

const formatTime = (t: string): string => t?.slice(0, 5) ?? t;

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
    accentColor: string;
    clinicName: string;
    slots: ScheduleItem[];
}

// ─── Grouping helper ──────────────────────────────────────────────────────────

const groupSchedules = (schedules: ScheduleItem[]): GroupedSchedule[] => {
    const map = new Map<string, GroupedSchedule>();

    schedules.forEach(item => {
        const dayKey = DAY_NUMBER_TO_KEY[item.day_of_week] ?? 'monday';
        const groupKey = `${item.day_of_week}_${item.clinic_id}`;

        if (!map.has(groupKey)) {
            map.set(groupKey, {
                groupKey,
                dayNumber: item.day_of_week,
                dayKey,
                dayShort: DAY_SHORT[dayKey] ?? '???',
                dayFull: DAY_FULL[dayKey] ?? dayKey,
                accentColor: DAY_COLORS[dayKey] ?? '#6b7280',
                clinicName: item.clinic?.clinic_name ?? 'Unknown Clinic',
                slots: [],
            });
        }

        map.get(groupKey)!.slots.push(item);
    });

    return Array.from(map.values()).sort(
        (a, b) => DAY_ORDER.indexOf(a.dayNumber) - DAY_ORDER.indexOf(b.dayNumber)
    );
};

// ─── Animated wrapper ─────────────────────────────────────────────────────────

const AnimatedListItem = ({ children, index }: { children: React.ReactNode; index: number }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 420, delay: index * 90, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 420, delay: index * 90, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
            {children}
        </Animated.View>
    );
};

// ─── Single slot row ──────────────────────────────────────────────────────────

const SlotRow = ({
    slot,
    accentColor,
    isLast,
    index,
}: {
    slot: ScheduleItem;
    accentColor: string;
    isLast: boolean;
    index: number;
}) => (
    <View>
        <View className="flex-row items-center px-4 py-3">
            {/* Index bubble */}
            <View
                className="w-6 h-6 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: accentColor + '22' }}
            >
                <Text className="text-xs font-black" style={{ color: accentColor }}>
                    {index + 1}
                </Text>
            </View>

            {/* Time range */}
            <View className="flex-row items-center flex-1">
                <View
                    className="px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: accentColor + '15' }}
                >
                    <Text className="text-xs font-bold" style={{ color: accentColor }}>
                        {formatTime(slot.start_time)}
                    </Text>
                </View>

                <View className="mx-2 h-px w-4 bg-gray-300" />

                <View
                    className="px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: accentColor + '15' }}
                >
                    <Text className="text-xs font-bold" style={{ color: accentColor }}>
                        {formatTime(slot.end_time)}
                    </Text>
                </View>
            </View>

            {/* Duration */}
            <View className="flex-row items-center bg-gray-100 px-2.5 py-1 rounded-lg">
                <Timer size={10} color="#9ca3af" style={{ marginRight: 3 }} />
                <Text className="text-gray-500 text-xs font-semibold">
                    {slot.slot_duration} min
                </Text>
            </View>
        </View>

        {!isLast && <View className="mx-4 h-px bg-gray-100" />}
    </View>
);

// ─── Group card ───────────────────────────────────────────────────────────────

const GroupCard = ({ group, index }: { group: GroupedSchedule; index: number }) => {
    const { accentColor, dayShort, dayFull, clinicName, slots } = group;

    return (
        <AnimatedListItem index={index}>
            <View
                className="bg-white rounded-2xl mb-4 overflow-hidden"
                style={{
                    shadowColor: accentColor,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 5,
                }}
            >
                {/* ── Header ── */}
                <View
                    className="flex-row items-center px-4 py-3"
                    style={{ backgroundColor: accentColor }}
                >
                    {/* Day pill */}
                    <View className="bg-white/25 px-3 py-1.5 rounded-xl mr-3">
                        <Text className="text-white font-black text-sm tracking-widest">
                            {dayShort}
                        </Text>
                    </View>

                    <View className="flex-1">
                        <Text className="text-white font-bold text-base leading-tight">
                            {dayFull}
                        </Text>
                        <View className="flex-row items-center mt-0.5">
                            <CalendarDays size={10} color="rgba(255,255,255,0.75)" style={{ marginRight: 4 }} />
                            <Text className="text-white/75 text-xs" numberOfLines={1}>
                                {clinicName}
                            </Text>
                        </View>
                    </View>

                    {/* Slot count badge */}
                    <View className="flex-row items-center bg-white/20 px-3 py-1.5 rounded-xl">
                        <Layers size={11} color="white" style={{ marginRight: 4 }} />
                        <Text className="text-white font-bold text-xs">
                            {slots.length} slot{slots.length !== 1 ? 's' : ''}
                        </Text>
                    </View>
                </View>

                {/* ── Slot rows ── */}
                <View className="py-1">
                    {slots.map((slot, i) => (
                        <SlotRow
                            key={slot.schedule_id}
                            slot={slot}
                            accentColor={accentColor}
                            isLast={i === slots.length - 1}
                            index={i}
                        />
                    ))}
                </View>

                {/* ── Bottom accent bar ── */}
                <View style={{ height: 3, backgroundColor: accentColor, opacity: 0.3 }} />
            </View>
        </AnimatedListItem>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const ScheduleScreen = () => {
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [grouped, setGrouped] = useState<GroupedSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [clinics, setClinics] = useState<any[]>([]);
    const [scheduleForm, setScheduleForm] = useState({
        clinic_id: '',
        day_of_week: '1',
        start_time: '09:00',
        end_time: '17:00',
        slot_duration: '30',
    });

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
        } catch (e) {
            console.error(e);
        }
    };

    const fetchClinics = async () => {
        try {
            const data = await getClinics();
            setClinics(data.clinics || []);
            if (data.clinics?.length > 0) {
                setScheduleForm(prev => ({ ...prev, clinic_id: data.clinics[0].clinic_id.toString() }));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateSchedule = async () => {
        setSubmitting(true);
        try {
            await createSchedule({
                clinicId: parseInt(scheduleForm.clinic_id),
                schedules: [{
                    day_of_week: parseInt(scheduleForm.day_of_week),
                    start_time: scheduleForm.start_time,
                    end_time: scheduleForm.end_time,
                    slot_duration: parseInt(scheduleForm.slot_duration),
                    effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                        .toISOString().split('T')[0],
                }],
            });
            setModalVisible(false);
            fetchSchedule();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#7c3aed" />
                <Text className="text-gray-400 mt-3 text-sm">Loading schedule...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#5b21b6' }} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#5b21b6" />
            <View className="flex-1 bg-gray-50">

                {/* ── Header ── */}
                <View
                    className="bg-violet-700 px-5 pt-6 pb-8"
                    style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
                >
                    <View className="flex-row justify-between items-center mb-4">
                        <View>
                            <Text className="text-white text-2xl font-bold">My Schedule</Text>
                            <Text className="text-violet-200 text-sm mt-1">
                                {schedule.length} slot{schedule.length !== 1 ? 's' : ''} · {grouped.length} group{grouped.length !== 1 ? 's' : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            className="bg-white p-3 rounded-full"
                            style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}
                        >
                            <Plus size={24} color="#5b21b6" />
                        </TouchableOpacity>
                    </View>

                    {/* Day chips */}
                    <View className="flex-row mt-2 flex-wrap gap-2">
                        {Object.entries(DAY_SHORT).map(([day, short]) => (
                            <View
                                key={day}
                                className="px-2 py-1 rounded-lg"
                                style={{ backgroundColor: DAY_COLORS[day] + '90' }}
                            >
                                <Text className="text-white text-xs font-bold">{short}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* ── Grouped list ── */}
                <FlatList
                    data={grouped}
                    keyExtractor={(item) => item.groupKey}
                    renderItem={({ item, index }) => <GroupCard group={item} index={index} />}
                    contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View className="items-center mt-20">
                            <Calendar size={52} color="#d1d5db" />
                            <Text className="text-gray-500 font-semibold text-base mt-4">
                                No schedule configured
                            </Text>
                            <Text className="text-gray-400 text-sm mt-1 text-center px-8">
                                Tap the + button to add your first schedule slot
                            </Text>
                        </View>
                    }
                />
            </View>

            {/* ── Add Schedule Modal ── */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[85%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-gray-800">Add Schedule Slot</Text>
                            <TouchableOpacity
                                onPress={() => setModalVisible(false)}
                                className="bg-gray-100 p-2 rounded-full"
                            >
                                <X size={24} color="#4b5563" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View className="space-y-5">

                                {/* Clinic */}
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Clinic</Text>
                                    <View className="flex-row flex-wrap gap-2">
                                        {clinics.map(c => {
                                            const selected = scheduleForm.clinic_id === c.clinic_id.toString();
                                            return (
                                                <TouchableOpacity
                                                    key={c.clinic_id}
                                                    onPress={() => setScheduleForm({ ...scheduleForm, clinic_id: c.clinic_id.toString() })}
                                                    className={`px-4 py-2 rounded-xl border ${selected ? 'bg-violet-50 border-violet-500' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-semibold text-sm ${selected ? 'text-violet-700' : 'text-gray-600'}`}>
                                                        {c.clinic_name}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Day of Week */}
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Day of Week</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View className="flex-row gap-2 pb-1">
                                            {([1, 2, 3, 4, 5, 6, 0] as number[]).map(day => {
                                                const key = DAY_NUMBER_TO_KEY[day];
                                                const label = DAY_SHORT[key]?.slice(0, 1) ?? day.toString();
                                                const color = DAY_COLORS[key] ?? '#6b7280';
                                                const selected = scheduleForm.day_of_week === day.toString();
                                                return (
                                                    <TouchableOpacity
                                                        key={day}
                                                        onPress={() => setScheduleForm({ ...scheduleForm, day_of_week: day.toString() })}
                                                        className="w-12 h-12 items-center justify-center rounded-full border"
                                                        style={{
                                                            backgroundColor: selected ? color : '#fff',
                                                            borderColor: selected ? color : '#e5e7eb',
                                                        }}
                                                    >
                                                        <Text
                                                            className="font-black text-xs"
                                                            style={{ color: selected ? '#fff' : '#6b7280' }}
                                                        >
                                                            {label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                </View>

                                {/* Start / End time */}
                                <View className="flex-row gap-4">
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Start Time</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="09:00"
                                            value={scheduleForm.start_time}
                                            onChangeText={(t) => setScheduleForm({ ...scheduleForm, start_time: t })}
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">End Time</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="17:00"
                                            value={scheduleForm.end_time}
                                            onChangeText={(t) => setScheduleForm({ ...scheduleForm, end_time: t })}
                                        />
                                    </View>
                                </View>

                                {/* Slot Duration */}
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Slot Duration (mins)</Text>
                                    <View className="flex-row gap-3">
                                        {['15', '30', '45', '60'].map(dur => {
                                            const selected = scheduleForm.slot_duration === dur;
                                            return (
                                                <TouchableOpacity
                                                    key={dur}
                                                    onPress={() => setScheduleForm({ ...scheduleForm, slot_duration: dur })}
                                                    className={`flex-1 py-3 items-center rounded-xl border ${selected ? 'bg-violet-50 border-violet-500' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-bold ${selected ? 'text-violet-700' : 'text-gray-600'}`}>
                                                        {dur}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Submit */}
                                <TouchableOpacity
                                    onPress={handleCreateSchedule}
                                    disabled={submitting}
                                    className={`bg-violet-600 rounded-2xl py-4 items-center mt-2 ${submitting ? 'opacity-70' : ''}`}
                                    style={{
                                        shadowColor: '#7c3aed',
                                        shadowOffset: { width: 0, height: 4 },
                                        shadowOpacity: 0.3,
                                        shadowRadius: 8,
                                        elevation: 4,
                                    }}
                                >
                                    {submitting
                                        ? <ActivityIndicator color="white" />
                                        : <Text className="text-white font-bold text-lg">Save Schedule</Text>
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

export default ScheduleScreen;