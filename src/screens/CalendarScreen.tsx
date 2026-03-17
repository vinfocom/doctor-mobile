import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    ActivityIndicator, StatusBar, Modal, FlatList,
    Animated, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ChevronLeft, ChevronRight, Users, CheckCircle2,
    Clock, X, CalendarDays, AlertCircle,
} from 'lucide-react-native';
import { getCalendarData } from '../api/calendar';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface DayData {
    date: string;
    total: number;
    arrived: number;
    upcoming: number;
    appointments: {
        appointment_id: number;
        status: string;
        cancelled_by?: string | null;
        start_time_display: string;
        patient_name: string;
        patient_phone: string;
        booking_id?: number;
        clinic_name: string;
    }[];
}

interface LeaveDay { date: string; reason: string; }

interface CalendarResponse {
    year: number;
    month: number;
    days: Record<string, DayData>;
    leaves: LeaveDay[];
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Green heat: white → light green → deep green */
const heatColor = (intensity: number): string => {
    if (intensity <= 0) return '#FFFFFF';
    // rgb(220,252,231) → rgb(22,101,52) (Tailwind green-100 → green-900)
    const r = Math.round(220 - intensity * (220 - 22));
    const g = Math.round(252 - intensity * (252 - 101));
    const b = Math.round(231 - intensity * (231 - 52));
    return `rgb(${r},${g},${b})`;
};

const textForHeat = (intensity: number) =>
    intensity > 0.55 ? '#f0fdf4' : intensity > 0 ? '#14532d' : '#9ca3af';

const toIST = (date: Date) =>
    new Date(date.getTime() + 5.5 * 60 * 60 * 1000);

const STATUS_CONFIG: Record<string, { badgeBg: string; text: string; dotColor: string }> = {
    booked: { badgeBg: '#e0e7ff', text: '#4338ca', dotColor: '#4338ca' },
    confirmed: { badgeBg: '#dcfce7', text: '#15803d', dotColor: '#15803d' },
    pending: { badgeBg: '#fef3c7', text: '#a16207', dotColor: '#a16207' },
    cancelled: { badgeBg: '#fee2e2', text: '#dc2626', dotColor: '#dc2626' },
    completed: { badgeBg: '#dcfce7', text: '#15803d', dotColor: '#15803d' },
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

// ──────────────────────────────────────────────────────────────
// Day Detail Modal
// ──────────────────────────────────────────────────────────────

const DayDetailModal = ({
    visible, data, leaveInfo, dateLabel, onClose,
}: {
    visible: boolean;
    data: DayData | null;
    leaveInfo: LeaveDay | null;
    dateLabel: string;
    onClose: () => void;
}) => {
    const slideAnim = useRef(new Animated.Value(600)).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        } else {
            slideAnim.setValue(600);
        }
    }, [visible]);

    const StatusBadge = ({ status, cancelledBy }: { status: string; cancelledBy?: string | null }) => {
        const s = STATUS_CONFIG[String(status || '').toLowerCase()] || { badgeBg: '#f3f4f6', text: '#4b5563', dotColor: '#4b5563' };
        return (
            <View style={{ backgroundColor: s.badgeBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, flexDirection: 'row', alignItems: 'center' }}>
                <View
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        backgroundColor: s.dotColor,
                        marginRight: 6,
                    }}
                />
                <Text style={{ color: s.text, fontSize: 11, fontWeight: '700' }}>{getStatusLabel(status, cancelledBy)}</Text>
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <View className="flex-1 bg-black/50 justify-end">
                <Animated.View style={{
                    transform: [{ translateY: slideAnim }],
                    backgroundColor: '#fff',
                    borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    maxHeight: '86%', paddingBottom: 30,
                }}>
                    {/* Header */}
                    <View className="flex-row justify-between items-center px-5 py-4 border-b border-gray-100">
                        <View className="flex-row items-center">
                            <CalendarDays size={20} color="#16a34a" style={{ marginRight: 8 }} />
                            <Text className="text-lg font-extrabold text-green-900">{dateLabel}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="bg-gray-100 rounded-full p-2">
                            <X size={18} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    {/* Leave banner */}
                    {leaveInfo && (
                        <View className="flex-row items-center mx-4 mt-3 rounded-xl px-3 py-2.5 border border-red-200 bg-red-50">
                            <AlertCircle size={16} color="#dc2626" style={{ marginRight: 8 }} />
                            <Text className="text-red-600 font-bold text-sm">
                                Leave Day{leaveInfo.reason ? `: ${leaveInfo.reason}` : ''}
                            </Text>
                        </View>
                    )}

                    {/* Stats */}
                    {data && data.total > 0 ? (
                        <>
                            <View className="flex-row mx-4 mt-3 mb-2" style={{ gap: 8 }}>
                                {/* Arrived */}
                                <View className="flex-1 bg-green-50 border border-green-200 rounded-2xl p-3 items-center">
                                    <CheckCircle2 size={20} color="#16a34a" />
                                    <Text className="text-2xl font-extrabold text-green-700 mt-1">{data.arrived}</Text>
                                    <Text className="text-xs text-green-500 font-semibold">Visited</Text>
                                </View>
                                {/* Upcoming */}
                                <View className="flex-1 bg-yellow-50 border border-yellow-200 rounded-2xl p-3 items-center">
                                    <Clock size={20} color="#ca8a04" />
                                    <Text className="text-2xl font-extrabold text-yellow-700 mt-1">{data.upcoming}</Text>
                                    <Text className="text-xs text-yellow-600 font-semibold">Not Visited</Text>
                                </View>
                                {/* Total */}
                                <View className="flex-1 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 items-center">
                                    <Users size={20} color="#059669" />
                                    <Text className="text-2xl font-extrabold text-emerald-700 mt-1">{data.total}</Text>
                                    <Text className="text-xs text-emerald-400 font-semibold">Total</Text>
                                </View>
                            </View>

                            <FlatList
                                data={data.appointments}
                                keyExtractor={item => String(item.appointment_id)}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}
                                renderItem={({ item, index }) => (
                                    <View className={`flex-row items-center rounded-2xl p-3 mb-2 border border-green-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                        <View className="w-9 h-9 rounded-full bg-green-100 items-center justify-center mr-3">
                                            <Text className="text-green-700 font-extrabold text-sm">
                                                {(item.patient_name || 'U').charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-green-900 text-sm" numberOfLines={1}>{item.patient_name}</Text>
                                            <View className="flex-row items-center mt-0.5" style={{ gap: 8 }}>
                                                <Text className="text-gray-400 text-xs">#{item.booking_id ?? item.appointment_id}</Text>
                                                {item.start_time_display ? (
                                                    <Text className="text-green-600 text-xs font-semibold">{item.start_time_display}</Text>
                                                ) : null}
                                                {item.clinic_name ? (
                                                    <Text className="text-gray-400 text-xs" numberOfLines={1}>{item.clinic_name}</Text>
                                                ) : null}
                                            </View>
                                        </View>
                                        <StatusBadge status={item.status} cancelledBy={item.cancelled_by} />
                                    </View>
                                )}
                            />
                        </>
                    ) : (
                        <View className="items-center py-12">
                            <Users size={44} color="#bbf7d0" />
                            <Text className="text-gray-500 font-semibold text-base mt-3">No appointments</Text>
                            <Text className="text-gray-300 text-sm mt-1">on this day</Text>
                        </View>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
};

// ──────────────────────────────────────────────────────────────
// Main Screen
// ──────────────────────────────────────────────────────────────

const CalendarScreen = () => {
    const istNow = toIST(new Date());
    const [year, setYear] = useState(istNow.getUTCFullYear());
    const [month, setMonth] = useState(istNow.getUTCMonth() + 1);
    const [data, setData] = useState<CalendarResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async (y: number, m: number) => {
        setLoading(true);
        try { setData(await getCalendarData(y, m)); }
        catch (e) { console.error('Calendar load error', e); }
        setLoading(false);
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData(year, month);
        setRefreshing(false);
    }, [year, month, loadData]);

    useEffect(() => { loadData(year, month); }, [year, month]);

    const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
    const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

    const leaveSet = new Set((data?.leaves || []).map(l => l.date));
    const leaveMap = new Map((data?.leaves || []).map(l => [l.date, l]));

    const allDays = Object.values(data?.days || {});
    const maxTotal = Math.max(1, ...allDays.map(d => d.total));

    const monthArrived = allDays.reduce((s, d) => s + d.arrived, 0);
    const monthUpcoming = allDays.reduce((s, d) => s + d.upcoming, 0);
    const monthTotal = allDays.reduce((s, d) => s + d.total, 0);

    const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: (number | null)[] = [
        ...Array(firstDayOfMonth).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const todayStr = toIST(new Date()).toISOString().slice(0, 10);

    const openDay = (dateStr: string) => { setSelectedDate(dateStr); setModalVisible(true); };

    const selectedDayData = selectedDate ? (data?.days?.[selectedDate] ?? null) : null;
    const selectedLeave = selectedDate ? (leaveMap.get(selectedDate) ?? null) : null;
    const selectedLabel = selectedDate
        ? new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : '';

    return (
        <SafeAreaView className="flex-1 bg-violet-700" edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#3c26beff" />
            <View className="flex-1 bg-white">

                {/* ── Header ── */}
                <View className="bg-violet-700 px-5 pt-4 pb-6 rounded-b-3xl">
                    <Text className="text-white text-xs font-semibold tracking-widest uppercase mb-0.5">Patient Calendar</Text>
                    <Text className="text-white text-2xl font-extrabold mb-4">Appointment Heatmap</Text>

                    {/* Month nav */}
                    <View className="flex-row items-center justify-between mb-4">
                        <TouchableOpacity onPress={prevMonth} className="bg-white/20 rounded-full p-2">
                            <ChevronLeft size={20} color="#fff" />
                        </TouchableOpacity>
                        <Text className="text-white text-xl font-extrabold">
                            {MONTH_NAMES[month - 1]} {year}
                        </Text>
                        <TouchableOpacity onPress={nextMonth} className="bg-white/20 rounded-full p-2">
                            <ChevronRight size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Summary pills */}
                    <View className="flex-row" style={{ gap: 8 }}>
                        <View className="flex-1 bg-white/20 rounded-2xl py-2.5 items-center">
                            <Text className="text-white text-xs font-semibold">Arrived</Text>
                            <Text className="text-white text-xl font-extrabold">{monthArrived}</Text>
                        </View>
                        <View className="flex-1 bg-white/20 rounded-2xl py-2.5 items-center">
                            <Text className="text-white text-xs font-semibold">Upcoming</Text>
                            <Text className="text-white text-xl font-extrabold">{monthUpcoming}</Text>
                        </View>
                        <View className="flex-1 bg-white/20 rounded-2xl py-2.5 items-center">
                            <Text className="text-white text-xs font-semibold">Total</Text>
                            <Text className="text-white text-xl font-extrabold">{monthTotal}</Text>
                        </View>
                    </View>
                </View>

                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#16a34a']} tintColor="#16a34a" />
                    }
                >

                    {/* Legend */}
                    <View className="flex-row items-center justify-end mb-2" style={{ gap: 12 }}>
                        <View className="flex-row items-center">
                            <View className="w-3.5 h-3.5 rounded bg-red-400 mr-1" />
                            <Text className="text-gray-400 text-xs font-semibold">Leave</Text>
                        </View>
                        <View className="flex-row items-center">
                            <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: heatColor(0.15), marginRight: 4, borderWidth: 1, borderColor: '#bbf7d0' }} />
                            <Text className="text-gray-400 text-xs font-semibold">Few</Text>
                        </View>
                        <View className="flex-row items-center">
                            <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: heatColor(1), marginRight: 4 }} />
                            <Text className="text-gray-400 text-xs font-semibold">Many</Text>
                        </View>
                    </View>

                    {/* Calendar grid */}
                    <View className="bg-white rounded-2xl p-3 shadow" style={{ elevation: 4, shadowColor: '#16a34a', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                        {/* Day headers */}
                        <View className="flex-row mb-1.5">
                            {DAY_LABELS.map(d => (
                                <View key={d} className="flex-1 items-center">
                                    <Text className="text-xs font-bold text-gray-400">{d}</Text>
                                </View>
                            ))}
                        </View>

                        {loading ? (
                            <View className="py-10 items-center">
                                <ActivityIndicator size="large" color="#16a34a" />
                                <Text className="text-green-400 mt-2 text-sm">Loading calendar…</Text>
                            </View>
                        ) : (
                            Array.from({ length: cells.length / 7 }, (_, rowIdx) => (
                                <View key={rowIdx} className="flex-row mb-1.5">
                                    {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
                                        if (!day) return <View key={colIdx} className="flex-1 m-0.5" />;

                                        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayData = data?.days?.[dateStr];
                                        const isLeave = leaveSet.has(dateStr);
                                        const isToday = dateStr === todayStr;
                                        const total = dayData?.total ?? 0;
                                        const intensity = total / maxTotal;

                                        let cellBg = heatColor(intensity);
                                        if (isLeave) cellBg = '#fef2f2';

                                        return (
                                            <TouchableOpacity
                                                key={colIdx}
                                                onPress={() => openDay(dateStr)}
                                                style={{
                                                    flex: 1, margin: 2, aspectRatio: 1,
                                                    borderRadius: 10,
                                                    backgroundColor: cellBg,
                                                    borderWidth: isToday ? 2 : 1,
                                                    borderColor: isToday ? '#16a34a' : isLeave ? '#fca5a5' : '#d1fae5',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}
                                                activeOpacity={0.75}
                                            >
                                                <Text style={{
                                                    fontSize: 13,
                                                    fontWeight: isToday ? '900' : '700',
                                                    color: isLeave ? '#dc2626' : textForHeat(intensity),
                                                }}>
                                                    {day}
                                                </Text>
                                                {total > 0 && (
                                                    <Text style={{ fontSize: 9, fontWeight: '800', color: isLeave ? '#ef4444' : intensity > 0.55 ? '#bbf7d0' : '#16a34a', marginTop: 1 }}>
                                                        {total}
                                                    </Text>
                                                )}
                                                {isLeave && total === 0 && (
                                                    <View className="w-1.5 h-1.5 rounded-full bg-red-400 mt-0.5" />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            ))
                        )}
                    </View>

                    {/* Intensity bar */}
                    {!loading && (
                        <View className="mt-3 flex-row items-center" style={{ gap: 4 }}>
                            <Text className="text-gray-400 text-xs font-semibold mr-1">0</Text>
                            {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
                                <View
                                    key={v}
                                    style={{
                                        flex: 1,
                                        height: 8,
                                        borderRadius: 4,
                                        backgroundColor: heatColor(v),
                                        borderWidth: 1,
                                        borderColor: '#d1d5db',
                                    }}
                                />
                            ))}
                            <Text className="text-gray-400 text-xs font-semibold ml-1">{maxTotal}</Text>
                        </View>
                    )}
                </ScrollView>
            </View>

            <DayDetailModal
                visible={modalVisible}
                data={selectedDayData}
                leaveInfo={selectedLeave}
                dateLabel={selectedLabel}
                onClose={() => setModalVisible(false)}
            />
        </SafeAreaView>
    );
};

export default CalendarScreen;
