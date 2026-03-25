import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    ActivityIndicator,
    StatusBar,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    TextInput,
    Modal,
    Alert,
    ScrollView,
    Linking,
    RefreshControl,
    Image,
} from 'react-native';
import { Buffer } from 'buffer';
import {
    Building2,
    Phone,
    MapPin,
    Circle,
    Building,
    Search,
    Plus,
    X,
    Pencil,
    Trash2,
    CalendarDays,
    Timer,
    Calendar,
    Layers,
    Clock,
    MoreVertical,
    Stethoscope,
    Camera,
    Image as ImageIcon,
    QrCode,
} from 'lucide-react-native';
import { SvgUri, SvgXml } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getClinics, createClinic, updateClinic, deleteClinic } from '../api/clinics';
import { getSchedule, createSchedule, updateSchedule, deleteSchedule } from '../api/schedule';
import * as ImagePicker from 'expo-image-picker';
import { uploadClinicBarcode } from '../api/uploads';
import { API_URL } from '../config/env';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const DAY_SHORT: Record<string, string> = {
    monday: 'MON', tuesday: 'TUE', wednesday: 'WED',
    thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN',
};
const DAY_FULL: Record<string, string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};
// Align with backend: Sunday=0 ... Saturday=6
const DAY_NUMBER_TO_KEY: Record<number, string> = {
    0: 'sunday', 1: 'monday', 2: 'tuesday',
    3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday',
};
const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const normalizeDayNumber = (day: number) => (day === 7 ? 6 : day);
const timeToMinutes = (value?: string) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    return Number(match[1]) * 60 + Number(match[2]);
};
const formatTime = (value?: string) => {
    const str = String(value || '').trim();
    if (/AM|PM/i.test(str)) return str;
    const match = str.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 'N/A';
    let hour = Number(match[1]);
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${match[2]} ${meridiem}`;
};
const parse24Hour = (value?: string) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return { hour12: 9, minute: '00', period: 'AM' as 'AM' | 'PM' };
    let h = Number(match[1]);
    const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return { hour12: h, minute: match[2], period };
};
const to24Hour = (hour12: number, minute: string, period: 'AM' | 'PM') => {
    let h = hour12 % 12;
    if (period === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${minute}`;
};
const normalizeClinicName = (name?: string) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

const decodeSvgDataUrl = (value?: string | null) => {
    if (!value || !value.startsWith('data:image/svg+xml')) return null;
    const [, payload = ''] = value.split(',', 2);
    if (!payload) return null;

    try {
        if (value.includes(';base64,')) {
            return Buffer.from(payload, 'base64').toString('utf-8');
        }
        return decodeURIComponent(payload);
    } catch {
        return null;
    }
};

// ─── Schedule types ───────────────────────────────────────────────────────────

interface ScheduleItem {
    schedule_id: number; day_of_week: number; clinic_id: number;
    clinic: { clinic_name: string }; start_time: string; end_time: string;
    slot_duration: number; effective_from: string; effective_to: string;
}
interface GroupedSchedule {
    groupKey: string; dayNumber: number; dayKey: string;
    dayShort: string; dayFull: string; clinicName: string; slots: ScheduleItem[];
}
interface ClinicScheduleGroup {
    clinicId: number;
    clinicName: string;
    days: Array<{
        dayNumber: number;
        dayKey: string;
        dayShort: string;
        dayFull: string;
        slots: ScheduleItem[];
    }>;
}
interface FormSlot {
    local_id: string; schedule_id?: number; day_of_week: string;
    start_time: string; end_time: string; slot_duration: string;
}

// ─── Schedule grouping ────────────────────────────────────────────────────────

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
            map.set(groupKey, { groupKey, dayNumber: normalizedDay, dayKey, dayShort: DAY_SHORT[dayKey] ?? '???', dayFull: DAY_FULL[dayKey] ?? dayKey, clinicName: clinicLabel, slots: [] });
        }
        const group = map.get(groupKey)!;
        if (!group.slots.some(s => Number(s.schedule_id) === Number(item.schedule_id))) {
            group.slots.push({ ...item, day_of_week: normalizedDay });
        }
    });
    return Array.from(map.values())
        .map(g => ({ ...g, slots: [...g.slots].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)) }))
        // Sort clinic-wise first, then by day order
        .sort((a, b) => {
            const cc = a.clinicName.localeCompare(b.clinicName);
            if (cc !== 0) return cc;
            return DAY_ORDER.indexOf(a.dayNumber) - DAY_ORDER.indexOf(b.dayNumber);
        });
};

// ─── Animated wrapper ─────────────────────────────────────────────────────────

const AnimListItem = ({ children, index, style }: { children: React.ReactNode; index: number; style?: any }) => {
    const fade = useRef(new Animated.Value(0)).current;
    const ty = useRef(new Animated.Value(16)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
            Animated.timing(ty, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
        ]).start();
    }, []);
    return <Animated.View style={[{ opacity: fade, transform: [{ translateY: ty }] }, style]}>{children}</Animated.View>;
};

// ─── Slot Options Popup ───────────────────────────────────────────────────────

const SlotOptionsPopup = ({ visible, onClose, onEdit, onDelete }: { visible: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) => {
    const scale = useRef(new Animated.Value(0.85)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }),
                Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
            ]).start();
        } else { scale.setValue(0.85); opacity.setValue(0); }
    }, [visible]);
    if (!visible) return null;
    return (
        <TouchableWithoutFeedback onPress={onClose}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
                <Animated.View style={{ opacity, transform: [{ scale }], position: 'absolute', right: 36, top: 4, backgroundColor: 'white', borderRadius: 12, shadowColor: '#6d28d9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, minWidth: 140, overflow: 'hidden', borderWidth: 1, borderColor: '#ede9fe', zIndex: 100 }}>
                    <TouchableOpacity onPress={() => { onClose(); onEdit(); }} className="flex-row items-center px-4 py-3 border-b border-violet-50" activeOpacity={0.7}>
                        <View className="w-7 h-7 rounded-lg bg-violet-50 items-center justify-center mr-3"><Pencil size={13} color="#6d28d9" /></View>
                        <Text className="text-violet-800 font-semibold text-sm">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { onClose(); onDelete(); }} className="flex-row items-center px-4 py-3" activeOpacity={0.7}>
                        <View className="w-7 h-7 rounded-lg bg-red-50 items-center justify-center mr-3"><Trash2 size={13} color="#ef4444" /></View>
                        <Text className="text-red-500 font-semibold text-sm">Delete</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </TouchableWithoutFeedback>
    );
};

// ─── Slot Row ─────────────────────────────────────────────────────────────────

const SlotRow = ({ slot, isLast, onEdit, onDelete, index }: { slot: ScheduleItem; isLast: boolean; onEdit: (s: ScheduleItem) => void; onDelete: (s: ScheduleItem) => void; index: number }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <View style={{ zIndex: 100 - index }}>
            <View className="flex-row items-center px-4 py-3">
                <View className="flex-row items-center flex-1">
                    <Clock size={12} color="#8b5cf6" style={{ marginRight: 6 }} />
                    <View className="bg-violet-50 px-2.5 py-1 rounded-lg"><Text className="text-violet-700 font-bold text-sm">{formatTime(slot.start_time)}</Text></View>
                    <View className="mx-2 h-px w-3 bg-gray-300" />
                    <View className="bg-violet-50 px-2.5 py-1 rounded-lg"><Text className="text-violet-700 font-bold text-sm">{formatTime(slot.end_time)}</Text></View>
                </View>
                <View className="flex-row items-center bg-gray-100 px-2 py-1 rounded-lg mr-2">
                    <Timer size={10} color="#9ca3af" style={{ marginRight: 3 }} />
                    <Text className="text-gray-400 text-xs font-semibold">{slot.slot_duration}m</Text>
                </View>
                <TouchableOpacity onPress={() => setMenuOpen(p => !p)} className="w-8 h-8 items-center justify-center rounded-lg bg-gray-50 border border-gray-100" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MoreVertical size={16} color="#6b7280" />
                </TouchableOpacity>
            </View>
            {menuOpen && <SlotOptionsPopup visible={menuOpen} onClose={() => setMenuOpen(false)} onEdit={() => onEdit(slot)} onDelete={() => onDelete(slot)} />}
            {!isLast && <View className="mx-3 h-px bg-gray-100" />}
        </View>
    );
};

// ─── Group Card ───────────────────────────────────────────────────────────────

const GroupCard = ({ group, index, onEditSlot, onDeleteSlot }: { group: GroupedSchedule; index: number; onEditSlot: (s: ScheduleItem) => void; onDeleteSlot: (s: ScheduleItem) => void }) => (
    <AnimListItem index={index} style={{ zIndex: 1000 - index }}>
        <View className="bg-white rounded-2xl mb-2.5 border border-violet-100" style={{ shadowColor: '#845ac9', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 }}>
            <View className="flex-row items-center px-3 py-2.5 bg-violet-50 border-b border-violet-100 rounded-t-2xl">
                <View className="bg-violet-600 px-2 py-1 rounded-lg mr-2.5"><Text className="text-white font-black text-xs tracking-wider">{group.dayShort}</Text></View>
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
                    <SlotRow key={slot.schedule_id} slot={slot} index={i} isLast={i === group.slots.length - 1} onEdit={onEditSlot} onDelete={onDeleteSlot} />
                ))}
            </View>
        </View>
    </AnimListItem>
);

const ClinicScheduleCard = ({ group, index, onEditSlot, onDeleteSlot }: { group: ClinicScheduleGroup; index: number; onEditSlot: (s: ScheduleItem) => void; onDeleteSlot: (s: ScheduleItem) => void }) => (
    <AnimListItem index={index} style={{ zIndex: 1000 - index }}>
        <View className="bg-white rounded-2xl mb-3 border border-violet-100" style={{ shadowColor: '#845ac9', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 }}>
            <View className="flex-row items-center px-4 py-3 bg-violet-50 border-b border-violet-100 rounded-t-2xl">
                <View className="bg-violet-600 px-2.5 py-1 rounded-lg mr-2.5">
                    <Text className="text-white font-black text-xs tracking-wider">{group.days.length}</Text>
                </View>
                <View className="flex-1">
                    <Text className="text-violet-900 font-bold text-sm" numberOfLines={1}>{group.clinicName}</Text>
                    <Text className="text-violet-400 text-xs mt-0.5">Clinic Schedule</Text>
                </View>
            </View>

            <View className="pt-1 pb-2">
                {group.days.map((d) => (
                    <View key={`${group.clinicId}-${d.dayNumber}`}>
                        <View className="flex-row items-center px-4 py-2">
                            <View className="bg-violet-100 px-2 py-0.5 rounded-md mr-2">
                                <Text className="text-violet-700 font-bold text-xs">{d.dayShort}</Text>
                            </View>
                            <Text className="text-gray-800 font-semibold text-sm flex-1">{d.dayFull}</Text>
                            <Text className="text-gray-400 text-xs font-semibold">{d.slots.length} slot{d.slots.length !== 1 ? 's' : ''}</Text>
                        </View>
                        {d.slots.map((slot, i) => (
                            <SlotRow key={slot.schedule_id} slot={slot} index={i} isLast={i === d.slots.length - 1} onEdit={onEditSlot} onDelete={onDeleteSlot} />
                        ))}
                        <View className="mx-4 h-px bg-gray-100" />
                    </View>
                ))}
            </View>
        </View>
    </AnimListItem>
);

// ─── Clinics sub-view ─────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
    const isActive = status?.toLowerCase() === 'active';
    return (
        <View className={`self-start px-3 py-1 rounded-full ${isActive ? 'bg-green-100' : 'bg-red-100'} flex-row items-center`}>
            <Circle size={8} color={isActive ? '#15803d' : '#dc2626'} fill={isActive ? '#15803d' : '#dc2626'} style={{ marginRight: 6 }} />
            <Text className={`text-xs font-bold ${isActive ? 'text-green-700' : 'text-red-600'}`}>{isActive ? 'Active' : 'Inactive'}</Text>
        </View>
    );
};

const ClinicsTab = ({ onAdd, clinics, filteredClinics, searchTerm, setSearchTerm, filterStatus, setFilterStatus, handleOpenEdit, handleDeleteClinic, handleGenerateBarcode, handleViewBarcode, loading, refreshing, onRefresh }: any) => {
    const renderItem = ({ item, index }: { item: any; index: number }) => (
        <AnimListItem index={index}>
            <TouchableOpacity activeOpacity={0.7} className="bg-white rounded-2xl mb-4 overflow-hidden" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
                <View className="bg-cyan-600 px-4 py-3 flex-row items-center">
                    <View className="bg-white w-9 h-9 rounded-full items-center justify-center mr-3">
                        <Building2 size={18} color="#0891b2" />
                    </View>
                    <Text className="text-white font-bold text-base flex-1" numberOfLines={1}>{item.clinic_name}</Text>
                </View>
                <View className="px-4 py-4">
                    <View className="flex-row items-center mb-2">
                        <Phone size={14} color="#9ca3af" style={{ marginRight: 4 }} />
                        <Text className="text-gray-500 text-sm mr-1">Phone:</Text>
                        <Text className="text-gray-800 text-sm font-semibold">{item.phone}</Text>
                    </View>
                    <View className="flex-row items-center mb-3">
                        <MapPin size={14} color="#9ca3af" style={{ marginRight: 4 }} />
                        <Text className="text-gray-500 text-sm mr-1">Location:</Text>
                        <Text className="text-gray-800 text-sm font-semibold flex-1" numberOfLines={1}>{item.location}</Text>
                    </View>
                    <StatusBadge status={item.status} />
                    <TouchableOpacity
                        onPress={() => handleGenerateBarcode(item)}
                        className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 flex-row items-center justify-center"
                    >
                        <QrCode size={16} color="#4338ca" />
                        <Text className="ml-2 text-indigo-700 font-semibold text-sm">Generate Bar Code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => handleViewBarcode(item)}
                        disabled={!item.qr_storage_url}
                        className={`mt-2 rounded-xl py-2.5 flex-row items-center justify-center border ${item.qr_storage_url ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-100'}`}
                    >
                        <QrCode size={16} color={item.qr_storage_url ? '#047857' : '#9ca3af'} />
                        <Text className={`ml-2 font-semibold text-sm ${item.qr_storage_url ? 'text-emerald-700' : 'text-gray-400'}`}>View Bar Code</Text>
                    </TouchableOpacity>
                    <View className="mt-3 flex-row">
                        <TouchableOpacity onPress={() => handleOpenEdit(item)} className="flex-1 mr-2 rounded-xl border border-cyan-200 bg-cyan-50 py-2.5 flex-row items-center justify-center">
                            <Pencil size={14} color="#0e7490" /><Text className="ml-2 text-cyan-700 font-semibold text-sm">Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteClinic(item)} className="flex-1 ml-2 rounded-xl border border-red-200 bg-red-50 py-2.5 flex-row items-center justify-center">
                            <Trash2 size={14} color="#dc2626" /><Text className="ml-2 text-red-600 font-semibold text-sm">Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        </AnimListItem>
    );

    return (
        <View className="flex-1">
            {/* Search & Filter */}
            <View className="bg-cyan-700 px-5 pb-5">
                <View className="bg-cyan-800/30 rounded-xl flex-row items-center px-4 py-3 border border-cyan-600/30 mb-3">
                    <Search size={20} color="#cffafe" />
                    <TextInput placeholder="Search clinics..." placeholderTextColor="#a5f3fc" value={searchTerm} onChangeText={setSearchTerm} className="flex-1 ml-3 text-white text-base" />
                    {searchTerm.length > 0 && <TouchableOpacity onPress={() => setSearchTerm('')}><X size={18} color="#cffafe" /></TouchableOpacity>}
                </View>
                <View className="flex-row" style={{ gap: 8 }}>
                    {['ALL', 'ACTIVE', 'INACTIVE'].map(s => (
                        <TouchableOpacity key={s} onPress={() => setFilterStatus(s as any)} className={`px-3 py-1.5 rounded-lg border ${filterStatus === s ? 'bg-white border-white' : 'bg-transparent border-cyan-600/50'}`}>
                            <Text className={`text-xs font-bold ${filterStatus === s ? 'text-cyan-700' : 'text-cyan-100'}`}>{s}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {loading && !clinics.length
                ? <View className="flex-1 justify-center items-center"><ActivityIndicator size="large" color="#2563eb" /></View>
                : <FlatList
                    data={filteredClinics}
                    keyExtractor={item => item.clinic_id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0e7490']} tintColor="#0e7490" />
                    }
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Building size={48} color="#9ca3af" />
                            <Text className="text-gray-500 font-semibold text-base mt-4">No clinics found</Text>
                            <Text className="text-gray-400 text-sm mt-1">{searchTerm ? 'Try adjusting your search' : 'Add your first clinic'}</Text>
                        </View>
                    }
                />
            }
        </View>
    );
};

// ─── Schedule sub-view ────────────────────────────────────────────────────────

const ScheduleTab = ({ onAdd, clinics, grouped, schedule, loading, handleEditSlot, handleDeleteSlot, refreshing, onRefresh }: any) => {
    const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);

    const clinicGroups = useMemo<ClinicScheduleGroup[]>(() => {
        const map = new Map<number, ClinicScheduleGroup>();
        (schedule || []).forEach((item: ScheduleItem) => {
            const clinicId = Number(item.clinic_id);
            const clinicLabel = (item.clinic?.clinic_name || '').trim() || (clinicId ? `Clinic ${clinicId}` : 'Unknown Clinic');
            const normalizedDay = normalizeDayNumber(Number(item.day_of_week));
            const dayKey = DAY_NUMBER_TO_KEY[normalizedDay] ?? 'monday';

            if (!map.has(clinicId)) {
                map.set(clinicId, { clinicId, clinicName: clinicLabel, days: [] });
            }
            const group = map.get(clinicId)!;
            let dayGroup = group.days.find((d) => d.dayNumber === normalizedDay);
            if (!dayGroup) {
                dayGroup = {
                    dayNumber: normalizedDay,
                    dayKey,
                    dayShort: DAY_SHORT[dayKey] ?? '???',
                    dayFull: DAY_FULL[dayKey] ?? dayKey,
                    slots: [],
                };
                group.days.push(dayGroup);
            }
            if (!dayGroup.slots.some((s) => Number(s.schedule_id) === Number(item.schedule_id))) {
                dayGroup.slots.push({ ...item, day_of_week: normalizedDay });
            }
        });

        const result = Array.from(map.values());
        result.forEach((g) => {
            g.days.sort((a, b) => DAY_ORDER.indexOf(a.dayNumber) - DAY_ORDER.indexOf(b.dayNumber));
            g.days.forEach((d) => d.slots.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)));
        });
        result.sort((a, b) => a.clinicName.localeCompare(b.clinicName));
        return result;
    }, [schedule]);

    const filteredClinicGroups = useMemo(() => {
        if (!selectedClinicId) return clinicGroups;
        return clinicGroups.filter((g) => g.clinicId === selectedClinicId);
    }, [clinicGroups, selectedClinicId]);

    return (
        <View className="flex-1">
            {/* Clinic filter chips */}
            <View className="bg-violet-600 pb-3 px-4">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row" style={{ gap: 8 }}>
                        {/* All chip */}
                        <TouchableOpacity
                            onPress={() => setSelectedClinicId(null)}
                            style={{
                                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                                backgroundColor: selectedClinicId === null ? '#fff' : 'rgba(255,255,255,0.18)',
                                borderWidth: 1,
                                borderColor: selectedClinicId === null ? '#fff' : 'rgba(255,255,255,0.3)',
                            }}
                        >
                            <Text style={{ color: selectedClinicId === null ? '#7c3aed' : '#e9d5ff', fontWeight: '700', fontSize: 13 }}>All</Text>
                        </TouchableOpacity>
                        {/* Clinic chips */}
                        {clinics.map((c: any) => {
                            const active = selectedClinicId === Number(c.clinic_id);
                            return (
                                <TouchableOpacity
                                    key={c.clinic_id}
                                    onPress={() => setSelectedClinicId(active ? null : Number(c.clinic_id))}
                                    style={{
                                        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                                        backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.18)',
                                        borderWidth: 1,
                                        borderColor: active ? '#fff' : 'rgba(255,255,255,0.3)',
                                    }}
                                >
                                    <Text style={{ color: active ? '#7c3aed' : '#e9d5ff', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                                        {c.clinic_name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>

            {loading
                ? <View className="flex-1 justify-center items-center"><ActivityIndicator size="large" color="#7c3aed" /></View>
                : <FlatList
                    data={filteredClinicGroups}
                    keyExtractor={item => String(item.clinicId)}
                    renderItem={({ item, index }) => <ClinicScheduleCard group={item} index={index} onEditSlot={handleEditSlot} onDeleteSlot={handleDeleteSlot} />}
                    contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7c3aed']} tintColor="#7c3aed" />
                    }
                    ListEmptyComponent={
                        <View className="items-center mt-20">
                            <View className="w-16 h-16 rounded-full bg-violet-100 items-center justify-center mb-4">
                                <Calendar size={30} color="#c4b5fd" />
                            </View>
                            <Text className="text-gray-600 font-semibold text-base">
                                {selectedClinicId ? 'No schedule for this clinic' : 'No schedule configured'}
                            </Text>
                            <Text className="text-gray-400 text-sm mt-1 text-center px-10">
                                {selectedClinicId ? 'Try selecting another clinic or add a slot' : 'Tap + to add your first schedule slot'}
                            </Text>
                        </View>
                    }
                />
            }
        </View>
    );
};

// ─── Main merged screen ───────────────────────────────────────────────────────

type Tab = 'clinics' | 'schedule';

const ClinicsScreen = () => {
    const [activeTab, setActiveTab] = useState<Tab>('clinics');

    // ── Clinics state
    const [clinics, setClinics] = useState<any[]>([]);
    const [clinicsLoading, setClinicsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [isClinicModalVisible, setClinicModalVisible] = useState(false);
    const [editingClinicId, setEditingClinicId] = useState<number | null>(null);
    const [clinicForm, setClinicForm] = useState({ clinic_name: '', location: '', phone: '', status: 'ACTIVE', barcode_url: '' });
    const [clinicSubmitting, setClinicSubmitting] = useState(false);
    const [barcodeUploading, setBarcodeUploading] = useState(false);
    const [barcodeError, setBarcodeError] = useState<string | null>(null);
    const [clinicsRefreshing, setClinicsRefreshing] = useState(false);
    const [qrPreviewVisible, setQrPreviewVisible] = useState(false);
    const [qrPreviewLoading, setQrPreviewLoading] = useState(false);
    const [qrPreviewError, setQrPreviewError] = useState<string | null>(null);
    const [qrPreviewImage, setQrPreviewImage] = useState<string | null>(null);
    const [qrPreviewSvg, setQrPreviewSvg] = useState<string | null>(null);
    const [qrPreviewSvgUri, setQrPreviewSvgUri] = useState<string | null>(null);
    const [qrPreviewClinic, setQrPreviewClinic] = useState<any | null>(null);
    const [qrPreviewMode, setQrPreviewMode] = useState<'generate' | 'view'>('generate');

    // ── Schedule state
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [grouped, setGrouped] = useState<GroupedSchedule[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [isScheduleModalVisible, setScheduleModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
    const [scheduleForm, setScheduleForm] = useState({ clinic_id: '' });
    const [formSlots, setFormSlots] = useState<FormSlot[]>([{ local_id: `slot-${Date.now()}`, day_of_week: '0', start_time: '09:00', end_time: '17:00', slot_duration: '30' }]);
    const [timePickerVisible, setTimePickerVisible] = useState(false);
    const [timePickerTarget, setTimePickerTarget] = useState<{ local_id: string; field: 'start_time' | 'end_time' } | null>(null);
    const [pickerHour, setPickerHour] = useState(9);
    const [pickerMinute, setPickerMinute] = useState('00');
    const [pickerPeriod, setPickerPeriod] = useState<'AM' | 'PM'>('AM');
    const [scheduleRefreshing, setScheduleRefreshing] = useState(false);

    useEffect(() => { fetchClinics(); fetchSchedule(); }, []);

    // ── Clinics fetching
    const fetchClinics = async () => {
        setClinicsLoading(true);
        try {
            const data = await getClinics();
            const list = data.clinics || [];
            setClinics(list);
            // default clinic for schedule form
            setScheduleForm(prev => ({ ...prev, clinic_id: prev.clinic_id || (list[0]?.clinic_id ? String(list[0].clinic_id) : '') }));
        } catch (e) { console.error(e); }
        setClinicsLoading(false);
    };

    const handleClinicsRefresh = async () => {
        setClinicsRefreshing(true);
        await fetchClinics();
        setClinicsRefreshing(false);
    };

    const handleGenerateBarcode = async (item: any) => {
        setQrPreviewMode('generate');
        setQrPreviewClinic(item);
        setQrPreviewVisible(true);
        setQrPreviewLoading(true);
        setQrPreviewError(null);
        setQrPreviewImage(null);
        setQrPreviewSvg(null);
        setQrPreviewSvgUri(null);

        try {
            const previewRes = await fetch(`${API_URL}/qr/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctor_id: Number(item.doctor_id),
                    clinic_id: Number(item.clinic_id),
                }),
            });

            const previewData = await previewRes.json();
            if (!previewRes.ok) {
                throw new Error(previewData.error || 'Failed to load QR preview');
            }

            const dataUrl = previewData.dataUrl || null;
            setQrPreviewImage(dataUrl);
            setQrPreviewSvg(decodeSvgDataUrl(dataUrl));
            setQrPreviewSvgUri(null);
            const url = `https://daptoservices.vinfocom.co.in/qr/generate/download?doctor_id=${item.doctor_id || ''}&clinic_id=${item.clinic_id}`;
            await updateClinic(item.clinic_id, {
                barcode_url: url,
                qr_storage_url: previewData.qrStorageUrl || null,
            });
            fetchClinics();
        } catch (e: any) {
            setQrPreviewError(e?.response?.data?.error || e?.message || 'Failed to load QR preview');
        } finally {
            setQrPreviewLoading(false);
        }
    };

    const handleViewBarcode = (item: any) => {
        setQrPreviewMode('view');
        const storageUrl = String(item?.qr_storage_url || '').trim();
        setQrPreviewClinic(item);
        setQrPreviewVisible(true);
        setQrPreviewLoading(false);
        setQrPreviewError(storageUrl ? null : 'Stored barcode not found');
        setQrPreviewSvg(null);
        setQrPreviewImage(storageUrl || null);
        setQrPreviewSvgUri(storageUrl && /\.svg(\?|$)/i.test(storageUrl) ? storageUrl : null);
    };

    const handleCreateOrUpdateClinic = async () => {
        if (!clinicForm.clinic_name || !clinicForm.location) { Alert.alert('Error', 'Please fill in Name and Location'); return; }
        setClinicSubmitting(true);
        try {
            if (editingClinicId) {
                await updateClinic(editingClinicId, {
                    clinic_name: clinicForm.clinic_name.trim(),
                    location: clinicForm.location.trim(),
                    phone: clinicForm.phone.trim(),
                    status: clinicForm.status,
                });
            } else {
                await createClinic({
                    clinic_name: clinicForm.clinic_name.trim(),
                    location: clinicForm.location.trim(),
                    phone: clinicForm.phone.trim(),
                    status: clinicForm.status,
                });
            }
            setClinicModalVisible(false); setEditingClinicId(null);
            setClinicForm({ clinic_name: '', location: '', phone: '', status: 'ACTIVE', barcode_url: '' });
            setBarcodeError(null);
            await fetchClinics();
        } catch (e: any) { Alert.alert('Error', e?.response?.data?.error || 'Failed to save clinic'); }
        setClinicSubmitting(false);
    };

    const uploadBarcodeAsset = async (asset: { uri: string; mimeType?: string | null; type?: string | null }) => {
        if (!asset?.uri) return;
        setBarcodeError(null);
        setBarcodeUploading(true);
        try {
            const uri = asset.uri;
            const name = uri.split('/').pop() || `barcode_${Date.now()}.jpg`;
            const mimeType = (asset.mimeType || asset.type || 'image/jpeg') as string;
            const uploaded = await uploadClinicBarcode({ uri, name, mimeType });
            setClinicForm((prev) => ({ ...prev, barcode_url: uploaded.url }));
        } catch (e: any) {
            setBarcodeError(e?.message || 'Upload failed');
        } finally {
            setBarcodeUploading(false);
        }
    };

    const handlePickBarcodeFromCamera = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission required', 'Please allow camera access to scan/upload a barcode.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.9,
        });
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (asset?.uri) await uploadBarcodeAsset(asset as any);
    };

    const handlePickBarcodeFromGallery = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission required', 'Please allow photo library access to upload a barcode.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.9,
        });
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (asset?.uri) await uploadBarcodeAsset(asset as any);
    };
    const handleOpenEdit = (clinic: any) => {
        setEditingClinicId(Number(clinic.clinic_id));
        setClinicForm({
            clinic_name: clinic.clinic_name || '',
            location: clinic.location || '',
            phone: clinic.phone || '',
            status: clinic.status || 'ACTIVE',
            barcode_url: clinic.barcode_url || '',
        });
        setBarcodeError(null);
        setClinicModalVisible(true);
    };
    const handleDeleteClinic = (clinic: any) => {
        Alert.alert('Delete clinic', `Delete "${clinic.clinic_name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteClinic(Number(clinic.clinic_id)); await fetchClinics(); } catch (e: any) { Alert.alert('Error', e?.response?.data?.error || 'Failed to delete'); } } },
        ]);
    };
    const filteredClinics = useMemo(() => clinics.filter(c => {
        const ms = c.clinic_name.toLowerCase().includes(searchTerm.toLowerCase()) || c.location.toLowerCase().includes(searchTerm.toLowerCase());
        const mf = filterStatus === 'ALL' || c.status === filterStatus;
        return ms && mf;
    }), [clinics, searchTerm, filterStatus]);

    // ── Schedule fetching
    const fetchSchedule = async () => {
        setScheduleLoading(true);
        try {
            const data = await getSchedule();
            const list: ScheduleItem[] = data?.schedules || data || [];
            setSchedule(list); setGrouped(groupSchedules(list));
        } catch (e) { console.error(e); }
        setScheduleLoading(false);
    };

    const handleScheduleRefresh = async () => {
        setScheduleRefreshing(true);
        await fetchSchedule();
        setScheduleRefreshing(false);
    };

    const createEmptySlot = (seed?: Partial<FormSlot>): FormSlot => ({
        local_id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        day_of_week: seed?.day_of_week || '0', start_time: seed?.start_time || '09:00',
        end_time: seed?.end_time || '17:00', slot_duration: seed?.slot_duration || '30',
    });
    const resetScheduleForm = () => {
        setEditingScheduleId(null);
        setScheduleForm(prev => ({ clinic_id: prev.clinic_id || (clinics[0]?.clinic_id ? String(clinics[0].clinic_id) : '') }));
        setFormSlots([createEmptySlot()]);
    };
    const handleSaveSchedule = async () => {
        if (!scheduleForm.clinic_id) return Alert.alert('Error', 'Please select a clinic');
        if (formSlots.length === 0) return Alert.alert('Error', 'Please add at least one slot');
        for (const slot of formSlots) {
            if (!slot.day_of_week || !slot.start_time || !slot.end_time || !slot.slot_duration) return Alert.alert('Error', 'Fill all fields for each slot');
            if (slot.start_time >= slot.end_time) return Alert.alert('Error', 'Start time must be earlier than end time');
        }
        setSubmitting(true);
        try {
            const payload = {
                clinicId: parseInt(scheduleForm.clinic_id),
                schedules: formSlots.map(slot => ({
                    schedule_id: slot.schedule_id,
                    day_of_week: parseInt(slot.day_of_week),
                    start_time: slot.start_time, end_time: slot.end_time,
                    slot_duration: parseInt(slot.slot_duration),
                    effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                })),
            };
            editingScheduleId ? await updateSchedule(payload) : await createSchedule(payload);
            setScheduleModalVisible(false); resetScheduleForm(); await fetchSchedule();
        } catch (e) { console.error(e); Alert.alert('Error', editingScheduleId ? 'Failed to update schedule' : 'Failed to create schedule'); }
        setSubmitting(false);
    };
    const handleEditSlot = (slot: ScheduleItem) => {
        setEditingScheduleId(Number(slot.schedule_id));
        setScheduleForm({ clinic_id: String(slot.clinic_id || '') });
        setFormSlots([{ local_id: `slot-edit-${slot.schedule_id}`, schedule_id: Number(slot.schedule_id), day_of_week: String(normalizeDayNumber(Number(slot.day_of_week))), start_time: String(slot.start_time || '09:00').slice(0, 5), end_time: String(slot.end_time || '17:00').slice(0, 5), slot_duration: String(slot.slot_duration || '30') }]);
        setScheduleModalVisible(true);
    };
    const handleDeleteSlot = (slot: ScheduleItem) => {
        Alert.alert('Delete Schedule Slot', `Delete ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteSchedule(Number(slot.schedule_id)); await fetchSchedule(); } catch (e) { Alert.alert('Error', 'Failed to delete schedule'); } } },
        ]);
    };
    const handlePatchFormSlot = (localId: string, patch: Partial<FormSlot>) => setFormSlots(prev => prev.map(s => s.local_id === localId ? { ...s, ...patch } : s));
    const handleRemoveFormSlot = (localId: string) => setFormSlots(prev => prev.length <= 1 ? prev : prev.filter(s => s.local_id !== localId));
    const handleAddFormSlot = () => { const last = formSlots[formSlots.length - 1]; setFormSlots(prev => [...prev, createEmptySlot({ day_of_week: last?.day_of_week, start_time: last?.start_time, end_time: last?.end_time, slot_duration: last?.slot_duration })]); };
    const openTimePicker = (localId: string, field: 'start_time' | 'end_time', currentValue: string) => {
        const parsed = parse24Hour(currentValue);
        setPickerHour(parsed.hour12); setPickerMinute(parsed.minute); setPickerPeriod(parsed.period);
        setTimePickerTarget({ local_id: localId, field }); setTimePickerVisible(true);
    };
    const applyPickedTime = () => {
        if (!timePickerTarget) return;
        const h = Math.min(12, Math.max(1, Number.isFinite(pickerHour) ? pickerHour : 9));
        const m = Math.min(59, Math.max(0, Number.parseInt(pickerMinute, 10) || 0));
        handlePatchFormSlot(timePickerTarget.local_id, { [timePickerTarget.field]: to24Hour(h, String(m).padStart(2, '0'), pickerPeriod) } as Partial<FormSlot>);
        setTimePickerVisible(false); setTimePickerTarget(null);
    };
    const nudgePicker = (field: 'hour' | 'minute', delta: number) => {
        if (field === 'hour') { setPickerHour(((pickerHour - 1 + delta + 120) % 12) + 1); return; }
        setPickerMinute(String(((Number.parseInt(pickerMinute, 10) + delta + 600) % 60)).padStart(2, '0'));
    };

    // ── Header accent colour depends on active tab
    const headerBg = activeTab === 'clinics' ? '#0e7490' : '#7c3aed';
    const safeAreaBg = activeTab === 'clinics' ? '#0e7490' : '#7c3aed';
    const addHandler = activeTab === 'clinics'
        ? () => { setEditingClinicId(null); setClinicForm({ clinic_name: '', location: '', phone: '', status: 'ACTIVE', barcode_url: '' }); setBarcodeError(null); setClinicModalVisible(true); }
        : () => { resetScheduleForm(); setScheduleModalVisible(true); };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: safeAreaBg }} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor={headerBg} />
            <View className="flex-1 bg-gray-50">

                {/* ── Header with internal tab switcher ── */}
                <View style={{ backgroundColor: headerBg, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
                    <View className="flex-row justify-between items-center mb-5">
                        <View>
                            <Text className="text-white text-2xl font-bold">
                                {activeTab === 'clinics' ? 'My Clinics' : 'My Schedule'}
                            </Text>
                            <Text style={{ color: activeTab === 'clinics' ? '#a5f3fc' : '#ddd6fe' }} className="text-sm mt-0.5">
                                {activeTab === 'clinics'
                                    ? `${filteredClinics.length} clinic${filteredClinics.length !== 1 ? 's' : ''}`
                                    : `${schedule.length} slot${schedule.length !== 1 ? 's' : ''} · ${grouped.length} group${grouped.length !== 1 ? 's' : ''}`}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={addHandler} className="bg-white w-11 h-11 rounded-full items-center justify-center" style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
                            <Plus size={22} color={headerBg} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Tab Switcher Pill ── */}
                    <View className="flex-row bg-black/20 rounded-2xl p-1">
                        <TouchableOpacity
                            onPress={() => setActiveTab('clinics')}
                            className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center ${activeTab === 'clinics' ? 'bg-white' : ''}`}
                        >
                            <Stethoscope size={15} color={activeTab === 'clinics' ? '#0e7490' : '#e0f7fa'} style={{ marginRight: 6 }} />
                            <Text className={`font-bold text-sm ${activeTab === 'clinics' ? 'text-cyan-800' : 'text-cyan-100'}`}>Clinics</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveTab('schedule')}
                            className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center ${activeTab === 'schedule' ? 'bg-white' : ''}`}
                        >
                            <Clock size={15} color={activeTab === 'schedule' ? '#7c3aed' : '#e0f7fa'} style={{ marginRight: 6 }} />
                            <Text className={`font-bold text-sm ${activeTab === 'schedule' ? 'text-violet-700' : 'text-cyan-100'}`}>Schedule</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Content ── */}
                {activeTab === 'clinics'
                    ? <ClinicsTab clinics={clinics} filteredClinics={filteredClinics} loading={clinicsLoading} refreshing={clinicsRefreshing} onRefresh={handleClinicsRefresh} searchTerm={searchTerm} setSearchTerm={setSearchTerm} filterStatus={filterStatus} setFilterStatus={setFilterStatus} handleOpenEdit={handleOpenEdit} handleDeleteClinic={handleDeleteClinic} handleGenerateBarcode={handleGenerateBarcode} handleViewBarcode={handleViewBarcode} onAdd={addHandler} />
                    : <ScheduleTab clinics={clinics} grouped={grouped} schedule={schedule} loading={scheduleLoading} refreshing={scheduleRefreshing} onRefresh={handleScheduleRefresh} handleEditSlot={handleEditSlot} handleDeleteSlot={handleDeleteSlot} onAdd={addHandler} />
                }
            </View>

            {/* ── Clinic Modal ── */}
            <Modal
                visible={qrPreviewVisible}
                animationType="fade"
                transparent
                onRequestClose={() => {
                    setQrPreviewVisible(false);
                    setQrPreviewClinic(null);
                    setQrPreviewImage(null);
                    setQrPreviewSvg(null);
                    setQrPreviewSvgUri(null);
                    setQrPreviewError(null);
                }}
            >
                <View className="flex-1 items-center justify-center bg-black/45 px-5">
                    <View className="w-full max-w-sm rounded-3xl bg-white p-5">
                        <View className="mb-4 flex-row items-start justify-between">
                            <View className="flex-1 pr-3">
                                <Text className="text-lg font-bold text-gray-900">QR Preview</Text>
                                <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
                                    {qrPreviewClinic?.clinic_name || 'Clinic QR code'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    setQrPreviewVisible(false);
                                    setQrPreviewClinic(null);
                                    setQrPreviewImage(null);
                                    setQrPreviewSvg(null);
                                    setQrPreviewSvgUri(null);
                                    setQrPreviewError(null);
                                }}
                                className="h-9 w-9 items-center justify-center rounded-full bg-gray-100"
                            >
                                <X size={18} color="#6b7280" />
                            </TouchableOpacity>
                        </View>

                        <View className="min-h-[280px] items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-5">
                            {qrPreviewLoading ? (
                                <View className="items-center">
                                    <ActivityIndicator size="large" color="#4f46e5" />
                                    <Text className="mt-3 text-sm text-gray-500">Loading preview...</Text>
                                </View>
                            ) : qrPreviewError ? (
                                <Text className="text-center text-sm font-medium text-red-500">{qrPreviewError}</Text>
                            ) : qrPreviewSvg ? (
                                <SvgXml xml={qrPreviewSvg} width="100%" height={240} />
                            ) : qrPreviewSvgUri ? (
                                <SvgUri uri={qrPreviewSvgUri} width="100%" height={240} />
                            ) : qrPreviewImage ? (
                                <Image source={{ uri: qrPreviewImage }} resizeMode="contain" style={{ width: '100%', height: 240 }} />
                            ) : (
                                <Text className="text-sm text-gray-500">Preview unavailable.</Text>
                            )}
                        </View>

                        <View className="mt-5 flex-row justify-end">
                            <TouchableOpacity
                                onPress={() => {
                                    setQrPreviewVisible(false);
                                    setQrPreviewClinic(null);
                                    setQrPreviewImage(null);
                                    setQrPreviewSvg(null);
                                    setQrPreviewSvgUri(null);
                                    setQrPreviewError(null);
                                }}
                                className="mr-3 rounded-xl border border-gray-200 px-4 py-2.5"
                            >
                                <Text className="font-semibold text-gray-600">Close</Text>
                            </TouchableOpacity>
                            {qrPreviewMode === 'generate' && (
                                <TouchableOpacity
                                    disabled={!qrPreviewClinic?.doctor_id || !qrPreviewClinic?.clinic_id}
                                    onPress={() => {
                                        if (!qrPreviewClinic?.doctor_id || !qrPreviewClinic?.clinic_id) return;
                                        Linking.openURL(`${API_URL}/qr/generate/download?doctor_id=${qrPreviewClinic.doctor_id}&clinic_id=${qrPreviewClinic.clinic_id}`);
                                    }}
                                    className={`rounded-xl px-4 py-2.5 ${qrPreviewClinic?.doctor_id && qrPreviewClinic?.clinic_id ? 'bg-indigo-600' : 'bg-indigo-300'}`}
                                >
                                    <Text className="font-semibold text-white">Download</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal animationType="slide" transparent visible={isClinicModalVisible} onRequestClose={() => { setClinicModalVisible(false); setEditingClinicId(null); }}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6" style={{ maxHeight: '85%' }}>
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-gray-800">{editingClinicId ? 'Edit Clinic' : 'Add New Clinic'}</Text>
                            <TouchableOpacity onPress={() => { setClinicModalVisible(false); setEditingClinicId(null); }} className="bg-gray-100 p-2 rounded-full"><X size={24} color="#4b5563" /></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 16 }}>
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Clinic Name</Text>
                                    <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base" placeholder="e.g. City Health Center" value={clinicForm.clinic_name} onChangeText={t => setClinicForm({ ...clinicForm, clinic_name: t })} />
                                </View>
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Phone Number</Text>
                                    <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base" placeholder="e.g. +91 98765 43210" keyboardType="phone-pad" value={clinicForm.phone} onChangeText={t => setClinicForm({ ...clinicForm, phone: t })} />
                                </View>
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Location</Text>
                                    <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base" placeholder="Full address" multiline value={clinicForm.location} onChangeText={t => setClinicForm({ ...clinicForm, location: t })} />
                                </View>

                            </View>
                            <View>
                                <Text className="text-sm font-bold text-gray-700 mb-2">Status</Text>
                                <View className="flex-row" style={{ gap: 12 }}>
                                    {['ACTIVE', 'INACTIVE'].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setClinicForm({ ...clinicForm, status: s })} className={`flex-1 py-3 items-center rounded-xl border ${clinicForm.status === s ? (s === 'ACTIVE' ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500') : 'bg-white border-gray-200'}`}>
                                            <Text className={`font-bold ${clinicForm.status === s ? (s === 'ACTIVE' ? 'text-green-700' : 'text-red-700') : 'text-gray-500'}`}>{s}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={handleCreateOrUpdateClinic}
                                disabled={clinicSubmitting}
                                className={`bg-cyan-600 rounded-2xl py-4 items-center mt-2 ${clinicSubmitting ? 'opacity-70' : ''}`}
                                style={{ shadowColor: '#0891b2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                            >
                                {clinicSubmitting
                                    ? <ActivityIndicator color="white" />
                                    : <Text className="text-white font-bold text-lg">{editingClinicId ? 'Save Changes' : 'Create Clinic'}</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Schedule Modal ── */}
            <Modal animationType="slide" transparent visible={isScheduleModalVisible} onRequestClose={() => { setScheduleModalVisible(false); resetScheduleForm(); }}>
                <View className="flex-1 justify-end bg-black/40">
                    <View className="bg-white rounded-t-3xl px-5 pt-5" style={{ height: '88%' }}>
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-xl font-bold text-gray-800">{editingScheduleId ? 'Edit Slot' : 'New Schedule Slot'}</Text>
                            <TouchableOpacity onPress={() => { setScheduleModalVisible(false); resetScheduleForm(); }} className="bg-gray-100 p-2 rounded-full"><X size={20} color="#6b7280" /></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Clinic */}
                            <Text className="text-sm font-bold text-gray-700 mb-2">Clinic</Text>
                            <View className="flex-row flex-wrap mb-5" style={{ gap: 8 }}>
                                {clinics.map(c => {
                                    const selected = scheduleForm.clinic_id === c.clinic_id.toString();
                                    return (
                                        <TouchableOpacity key={c.clinic_id} onPress={() => setScheduleForm({ ...scheduleForm, clinic_id: c.clinic_id.toString() })} className={`px-4 py-2 rounded-xl border ${selected ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}>
                                            <Text className={`font-semibold text-sm ${selected ? 'text-violet-700' : 'text-gray-500'}`}>{c.clinic_name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Slots */}
                            {formSlots.map((slot, slotIndex) => (
                                <View key={slot.local_id} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-3">
                                    <View className="flex-row items-center justify-between mb-3">
                                        <Text className="text-sm font-bold text-gray-700">Slot {slotIndex + 1}</Text>
                                        {formSlots.length > 1 && <TouchableOpacity onPress={() => handleRemoveFormSlot(slot.local_id)} className="bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg"><Text className="text-red-400 text-xs font-semibold">Remove</Text></TouchableOpacity>}
                                    </View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Day of Week</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                                        <View className="flex-row" style={{ gap: 8, paddingBottom: 4 }}>
                                            {([0, 1, 2, 3, 4, 5, 6] as number[]).map(day => {
                                                const key = DAY_NUMBER_TO_KEY[day];
                                                const label = DAY_SHORT[key]?.slice(0, 1) ?? String(day);
                                                const selected = slot.day_of_week === day.toString();
                                                return (
                                                    <TouchableOpacity key={`${slot.local_id}-day-${day}`} onPress={() => handlePatchFormSlot(slot.local_id, { day_of_week: day.toString() })} className={`w-10 h-10 items-center justify-center rounded-full border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}>
                                                        <Text className={`font-black text-xs ${selected ? 'text-white' : 'text-gray-400'}`}>{label}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                    <View className="flex-row mb-3" style={{ gap: 12 }}>
                                        {(['start_time', 'end_time'] as const).map(field => (
                                            <View key={field} className="flex-1">
                                                <Text className="text-sm font-bold text-gray-700 mb-1.5">{field === 'start_time' ? 'Start' : 'End'}</Text>
                                                <TouchableOpacity onPress={() => openTimePicker(slot.local_id, field, slot[field])} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                                                    <Text className="text-gray-800 text-sm font-semibold">{formatTime(slot[field])}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Duration (mins)</Text>
                                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                                        {['15', '30', '45', '60'].map(dur => {
                                            const selected = slot.slot_duration === dur;
                                            return (
                                                <TouchableOpacity
                                                    key={`${slot.local_id}-dur-${dur}`}
                                                    onPress={() => handlePatchFormSlot(slot.local_id, { slot_duration: dur })}
                                                    className={`py-2.5 px-4 items-center rounded-xl border ${selected ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-bold text-sm ${selected ? 'text-violet-700' : 'text-gray-500'}`}>{dur} min</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                        {/* Custom chip */}
                                        {(() => {
                                            const isCustom = !['15', '30', '45', '60'].includes(slot.slot_duration);
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        if (!isCustom) handlePatchFormSlot(slot.local_id, { slot_duration: '' });
                                                    }}
                                                    className={`py-2.5 px-4 items-center rounded-xl border ${isCustom ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-bold text-sm ${isCustom ? 'text-violet-700' : 'text-gray-500'}`}>Custom</Text>
                                                </TouchableOpacity>
                                            );
                                        })()}
                                    </View>
                                    {/* Custom duration input — visible only when a non-preset value is active */}
                                    {!['15', '30', '45', '60'].includes(slot.slot_duration) && (
                                        <View className="mt-2 flex-row items-center bg-violet-50 border border-violet-300 rounded-xl px-4 py-2.5">
                                            <TextInput
                                                keyboardType="number-pad"
                                                placeholder="e.g. 20"
                                                placeholderTextColor="#a78bfa"
                                                maxLength={3}
                                                value={slot.slot_duration}
                                                onChangeText={t => {
                                                    const n = t.replace(/[^\d]/g, '');
                                                    handlePatchFormSlot(slot.local_id, { slot_duration: n });
                                                }}
                                                className="flex-1 text-violet-800 font-bold text-base"
                                            />
                                            <Text className="text-violet-400 text-sm font-semibold ml-1">min</Text>
                                        </View>
                                    )}
                                </View>
                            ))}

                            {!editingScheduleId && (
                                <TouchableOpacity onPress={handleAddFormSlot} className="border border-dashed border-violet-300 bg-violet-50 rounded-xl py-3 items-center mb-4">
                                    <Text className="text-violet-500 font-semibold text-sm">+ Add Another Slot</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={handleSaveSchedule} disabled={submitting} className={`bg-violet-600 rounded-2xl py-4 items-center mb-8 ${submitting ? 'opacity-60' : ''}`} style={{ shadowColor: '#6d28d9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}>
                                {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-base">{editingScheduleId ? 'Update Schedule' : 'Save Schedule'}</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal >

            {/* ── Time Picker Modal ── */}
            < Modal animationType="fade" transparent visible={timePickerVisible} onRequestClose={() => { setTimePickerVisible(false); setTimePickerTarget(null); }}>
                <View className="flex-1 justify-center items-center bg-black/40 px-5">
                    <View className="w-full bg-white rounded-2xl p-5">
                        <Text className="text-lg font-bold text-gray-800 mb-1">Select Time</Text>
                        <Text className="text-xs text-gray-400 mb-4">12-hour format</Text>
                        <View className="flex-row mb-4" style={{ gap: 12 }}>
                            <View className="flex-1">
                                <Text className="text-xs font-semibold text-gray-500 mb-1.5">Hour</Text>
                                <View className="flex-row items-center">
                                    <TouchableOpacity onPress={() => nudgePicker('hour', -1)} className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-l-xl"><Text className="text-violet-600 font-bold">−</Text></TouchableOpacity>
                                    <TextInput value={String(pickerHour)} onChangeText={t => { const n = Number.parseInt(t.replace(/[^\d]/g, ''), 10); if (!Number.isNaN(n)) setPickerHour(Math.min(12, Math.max(1, n))); }} keyboardType="number-pad" maxLength={2} className="flex-1 border-t border-b border-gray-200 text-center text-base font-bold text-gray-800 py-2" />
                                    <TouchableOpacity onPress={() => nudgePicker('hour', 1)} className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-r-xl"><Text className="text-violet-600 font-bold">+</Text></TouchableOpacity>
                                </View>
                            </View>
                            <View className="flex-1">
                                <Text className="text-xs font-semibold text-gray-500 mb-1.5">Minute</Text>
                                <View className="flex-row items-center">
                                    <TouchableOpacity onPress={() => nudgePicker('minute', -5)} className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-l-xl"><Text className="text-violet-600 font-bold">−</Text></TouchableOpacity>
                                    <TextInput value={pickerMinute} onChangeText={t => { const n = Number.parseInt(t.replace(/[^\d]/g, ''), 10); if (Number.isNaN(n)) { setPickerMinute('00'); return; } setPickerMinute(String(Math.min(59, Math.max(0, n))).padStart(2, '0')); }} keyboardType="number-pad" maxLength={2} className="flex-1 border-t border-b border-gray-200 text-center text-base font-bold text-gray-800 py-2" />
                                    <TouchableOpacity onPress={() => nudgePicker('minute', 5)} className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-r-xl"><Text className="text-violet-600 font-bold">+</Text></TouchableOpacity>
                                </View>
                            </View>
                        </View>
                        <View className="flex-row mb-4" style={{ gap: 8 }}>
                            {['00', '15', '30', '45'].map(m => {
                                const selected = pickerMinute === m;
                                return <TouchableOpacity key={m} onPress={() => setPickerMinute(m)} className={`flex-1 py-2 items-center rounded-xl border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}><Text className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-500'}`}>:{m}</Text></TouchableOpacity>;
                            })}
                        </View>
                        <View className="flex-row mb-4" style={{ gap: 8 }}>
                            {(['AM', 'PM'] as const).map(p => {
                                const selected = pickerPeriod === p;
                                return <TouchableOpacity key={p} onPress={() => setPickerPeriod(p)} className={`flex-1 py-2.5 items-center rounded-xl border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}><Text className={`font-bold ${selected ? 'text-white' : 'text-gray-500'}`}>{p}</Text></TouchableOpacity>;
                            })}
                        </View>
                        <View className="bg-violet-50 border border-violet-100 rounded-xl py-2.5 mb-4 items-center">
                            <Text className="text-violet-700 font-bold text-xl tracking-widest">{String(pickerHour).padStart(2, '0')}:{pickerMinute} {pickerPeriod}</Text>
                        </View>
                        <View className="flex-row" style={{ gap: 8 }}>
                            <TouchableOpacity onPress={() => { setTimePickerVisible(false); setTimePickerTarget(null); }} className="flex-1 py-3 rounded-xl bg-gray-100 items-center"><Text className="text-gray-500 font-semibold">Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={applyPickedTime} className="flex-1 py-3 rounded-xl bg-violet-600 items-center"><Text className="text-white font-bold">Apply</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal >
        </SafeAreaView >
    );
};

export default ClinicsScreen;
