import React from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    ArrowRight,
    BriefcaseMedical,
    Building2,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock3,
    Eye,
    EyeOff,
    Info,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
    User,
    Users,
} from 'lucide-react-native';

import { createClinic, getClinics } from '../api/clinics';
import { createSchedule } from '../api/schedule';
import { createStaff } from '../api/staff';
import { getProfile } from '../api/auth';
import { doctorNeedsSetup } from '../lib/doctorOnboarding';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DoctorOnboarding'>;
type ClinicStatus = 'ACTIVE' | 'INACTIVE';
type StaffRole = 'HAVE_ACCESS' | 'VIEWER';
type StaffStatus = 'ACTIVE' | 'INACTIVE';
type OnboardingStep = 1 | 2 | 3 | 4;
type ScheduleSlot = {
    local_id: string;
    day_of_week: string[];
    start_time: string;
    end_time: string;
    slot_duration: string;
};

const DAYS = [
    { label: 'S', value: '0', full: 'Sunday' },
    { label: 'M', value: '1', full: 'Monday' },
    { label: 'T', value: '2', full: 'Tuesday' },
    { label: 'W', value: '3', full: 'Wednesday' },
    { label: 'T', value: '4', full: 'Thursday' },
    { label: 'F', value: '5', full: 'Friday' },
    { label: 'S', value: '6', full: 'Saturday' },
];
const DURATIONS = ['15', '30', '45', '60'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (value: number) => String(value).padStart(2, '0');
const ymdFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`;
const toYMDUTC = (date: Date) => ymdFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
const getISTTodayYMD = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return toYMDUTC(ist);
};

const createSlot = (seed?: Partial<ScheduleSlot>): ScheduleSlot => ({
    local_id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    day_of_week: seed?.day_of_week?.length ? seed.day_of_week : ['1'],
    start_time: seed?.start_time || '09:00',
    end_time: seed?.end_time || '17:00',
    slot_duration: seed?.slot_duration || '30',
});

const timeToMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
};

const formatTime = (value?: string) => {
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

const to24Hour = (hour12: number, minute: string, period: 'AM' | 'PM') => {
    let hour24 = hour12 % 12;
    if (period === 'PM') hour24 += 12;
    return `${String(hour24).padStart(2, '0')}:${minute}`;
};

type CalendarPickerProps = {
    selectedDate: string;
    onSelect: (date: string) => void;
    minDate?: string;
};

const CalendarPicker = ({ selectedDate, onSelect, minDate }: CalendarPickerProps) => {
    const todayYMD = getISTTodayYMD();
    const [initYear, initMonth] = (() => {
        if (selectedDate && DATE_REGEX.test(selectedDate)) {
            const [year, month] = selectedDate.split('-').map(Number);
            return [year || Number(todayYMD.slice(0, 4)), (month || 1) - 1];
        }
        return [Number(todayYMD.slice(0, 4)), Number(todayYMD.slice(5, 7)) - 1];
    })();

    const [viewYear, setViewYear] = React.useState(initYear);
    const [viewMonth, setViewMonth] = React.useState(initMonth);
    const minDateStr = minDate && DATE_REGEX.test(minDate) ? minDate : todayYMD;
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const prevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear((year) => year - 1);
            return;
        }
        setViewMonth((month) => month - 1);
    };

    const nextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear((year) => year + 1);
            return;
        }
        setViewMonth((month) => month + 1);
    };

    return (
        <View className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
            <View className="flex-row items-center justify-between px-4 py-3 bg-blue-600 rounded-t-2xl">
                <TouchableOpacity onPress={prevMonth} className="p-1">
                    <ChevronLeft size={20} color="#ffffff" />
                </TouchableOpacity>
                <Text className="text-white font-bold text-base">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} className="p-1">
                    <ChevronRight size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>

            <View className="flex-row bg-blue-50 px-2 py-2">
                {DAY_LABELS.map((label) => (
                    <View key={label} className="flex-1 items-center">
                        <Text className="text-blue-400 text-xs font-bold">{label}</Text>
                    </View>
                ))}
            </View>

            <View className="px-2 pb-3 pt-1">
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                    <View key={row} className="flex-row">
                        {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                            if (!day) return <View key={`${row}-${col}`} className="flex-1 m-1" />;

                            const dateStr = ymdFromParts(viewYear, viewMonth + 1, day);
                            const isSelected = dateStr === selectedDate;
                            const isToday = dateStr === todayYMD;
                            const isDisabled = dateStr < minDateStr;
                            const bgColor = isSelected ? '#2563eb' : isToday ? '#dbeafe' : 'transparent';
                            const textColor = isSelected ? '#ffffff' : isToday ? '#1d4ed8' : isDisabled ? '#9ca3af' : '#374151';

                            return (
                                <TouchableOpacity
                                    key={`${row}-${col}`}
                                    onPress={() => !isDisabled && onSelect(dateStr)}
                                    disabled={isDisabled}
                                    className={`flex-1 m-1 h-9 items-center justify-center rounded-xl ${isDisabled ? 'opacity-30' : 'opacity-100'}`}
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

export default function DoctorOnboardingScreen() {
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const [bootLoading, setBootLoading] = React.useState(true);
    const [step, setStep] = React.useState<OnboardingStep>(1);
    const [saving, setSaving] = React.useState(false);
    const [createdClinicId, setCreatedClinicId] = React.useState<number | null>(null);
    const [createdClinicName, setCreatedClinicName] = React.useState('');
    const [scheduleSaved, setScheduleSaved] = React.useState(false);

    const [clinicName, setClinicName] = React.useState('');
    const [clinicPhone, setClinicPhone] = React.useState('');
    const [clinicLocation, setClinicLocation] = React.useState('');
    const [clinicStatus, setClinicStatus] = React.useState<ClinicStatus>('ACTIVE');

    const [slots, setSlots] = React.useState<ScheduleSlot[]>([createSlot()]);

    const [addStaff, setAddStaff] = React.useState(false);
    const [staffUsername, setStaffUsername] = React.useState('');
    const [staffEmail, setStaffEmail] = React.useState('');
    const [staffPassword, setStaffPassword] = React.useState('');
    const [showStaffPassword, setShowStaffPassword] = React.useState(false);
    const [staffRole, setStaffRole] = React.useState<StaffRole>('HAVE_ACCESS');
    const [staffStatus, setStaffStatus] = React.useState<StaffStatus>('ACTIVE');
    const [staffClinicScope, setStaffClinicScope] = React.useState<'FIRST_CLINIC' | 'ALL'>('FIRST_CLINIC');
    const [staffWhatsapp, setStaffWhatsapp] = React.useState('');
    const [isLimited, setIsLimited] = React.useState(false);
    const [validFrom, setValidFrom] = React.useState('');
    const [validTo, setValidTo] = React.useState('');
    const [datePickerField, setDatePickerField] = React.useState<'valid_from' | 'valid_to' | null>(null);
    const [keyboardVisible, setKeyboardVisible] = React.useState(false);
    const [timePickerVisible, setTimePickerVisible] = React.useState(false);
    const [timePickerTarget, setTimePickerTarget] = React.useState<{ local_id: string; field: 'start_time' | 'end_time' } | null>(null);
    const [pickerHour, setPickerHour] = React.useState(9);
    const [pickerMinute, setPickerMinute] = React.useState('00');
    const [pickerPeriod, setPickerPeriod] = React.useState<'AM' | 'PM'>('AM');

    React.useEffect(() => {
        const loadExistingSetup = async () => {
            try {
                const profile = await getProfile();
                if (!doctorNeedsSetup(profile)) {
                    navigation.replace('DoctorMain');
                    return;
                }

                const clinics = profile?.doctor?.clinics || [];
                const firstClinic = clinics[0];
                if (firstClinic?.clinic_id) {
                    setCreatedClinicId(Number(firstClinic.clinic_id));
                    setCreatedClinicName(firstClinic.clinic_name || 'First clinic');
                    setScheduleSaved(Boolean(firstClinic.schedules?.length));
                    setStep(2);
                }
            } catch {
                try {
                    const data = await getClinics();
                    const firstClinic = data?.clinics?.[0];
                    if (firstClinic?.clinic_id) {
                        setCreatedClinicId(Number(firstClinic.clinic_id));
                        setCreatedClinicName(firstClinic.clinic_name || 'First clinic');
                        setScheduleSaved(Boolean(firstClinic.schedules?.length));
                        setStep(2);
                    }
                } catch {
                    // Keep onboarding on step 1 if the setup state cannot be resolved.
                }
            } finally {
                setBootLoading(false);
            }
        };

        loadExistingSetup();
    }, [navigation]);

    React.useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const patchSlot = (localId: string, patch: Partial<ScheduleSlot>) => {
        setSlots((prev) => prev.map((slot) => (slot.local_id === localId ? { ...slot, ...patch } : slot)));
    };

    const toggleSlotDay = (localId: string, day: string) => {
        setSlots((prev) =>
            prev.map((slot) => {
                if (slot.local_id !== localId) return slot;
                const selectedDays = slot.day_of_week.includes(day)
                    ? slot.day_of_week.filter((item) => item !== day)
                    : [...slot.day_of_week, day].sort((a, b) => Number(a) - Number(b));

                return { ...slot, day_of_week: selectedDays.length ? selectedDays : [day] };
            })
        );
    };

    const addScheduleSlot = () => {
        const last = slots[slots.length - 1];
        setSlots((prev) => [...prev, createSlot(last)]);
    };

    const removeScheduleSlot = (localId: string) => {
        setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((slot) => slot.local_id !== localId)));
    };

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
        patchSlot(timePickerTarget.local_id, { [timePickerTarget.field]: value } as Partial<ScheduleSlot>);
        setTimePickerVisible(false);
        setTimePickerTarget(null);
    };

    const nudgePicker = (field: 'hour' | 'minute', delta: number) => {
        if (field === 'hour') {
            setPickerHour(((pickerHour - 1 + delta + 120) % 12) + 1);
            return;
        }
        setPickerMinute(String((Number.parseInt(pickerMinute, 10) + delta + 600) % 60).padStart(2, '0'));
    };

    const todayYMD = React.useMemo(() => getISTTodayYMD(), []);
    const validToMinDate = validFrom && validFrom > todayYMD ? validFrom : todayYMD;

    const selectValidityDate = (field: 'valid_from' | 'valid_to', date: string) => {
        if (field === 'valid_from') {
            setValidFrom(date);
            if (validTo && validTo < date) {
                setValidTo(date);
            }
        } else {
            setValidTo(date);
        }
        setDatePickerField(null);
    };

    const saveClinic = async () => {
        if (createdClinicId) {
            setStep(2);
            return;
        }

        if (!clinicName.trim() || !clinicLocation.trim()) {
            Alert.alert('Error', 'Please fill in clinic name and location');
            return;
        }

        setSaving(true);
        try {
            const response = await createClinic({
                clinic_name: clinicName.trim(),
                location: clinicLocation.trim(),
                phone: clinicPhone.trim(),
                status: clinicStatus,
            });
            const clinic = response?.clinic;
            if (!clinic?.clinic_id) {
                Alert.alert('Error', 'Clinic created but clinic details were not returned. Please reopen setup.');
                return;
            }

            setCreatedClinicId(Number(clinic.clinic_id));
            setCreatedClinicName(clinic.clinic_name || clinicName.trim());
            setStep(2);
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to create clinic');
        } finally {
            setSaving(false);
        }
    };

    const validateSchedules = () => {
        if (!createdClinicId) {
            Alert.alert('Error', 'Please create your first clinic before adding schedule');
            return false;
        }

        if (slots.length === 0) {
            Alert.alert('Error', 'Please add at least one schedule slot');
            return false;
        }

        for (const slot of slots) {
            if (!slot.day_of_week.length || !slot.start_time || !slot.end_time || !slot.slot_duration) {
                Alert.alert('Error', 'Please fill all fields for each slot');
                return false;
            }
            if (!TIME_REGEX.test(slot.start_time) || !TIME_REGEX.test(slot.end_time)) {
                Alert.alert('Error', 'Please enter time in HH:MM 24-hour format');
                return false;
            }
            if (timeToMinutes(slot.start_time) >= timeToMinutes(slot.end_time)) {
                Alert.alert('Error', 'Start time must be earlier than end time');
                return false;
            }
            const duration = Number(slot.slot_duration);
            if (!Number.isFinite(duration) || duration <= 0) {
                Alert.alert('Error', 'Please enter a valid duration for each slot');
                return false;
            }
        }

        return true;
    };

    const saveSchedule = async () => {
        if (scheduleSaved) {
            setStep(3);
            return;
        }

        if (!validateSchedules()) return;

        setSaving(true);
        try {
            await createSchedule({
                clinicId: Number(createdClinicId),
                schedules: slots.flatMap((slot) => slot.day_of_week.map((day) => ({
                    day_of_week: Number(day),
                    start_time: slot.start_time,
                    end_time: slot.end_time,
                    slot_duration: Number(slot.slot_duration),
                    effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
                }))),
            });
            setScheduleSaved(true);
            setStep(3);
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to create schedule');
        } finally {
            setSaving(false);
        }
    };

    const validateStaff = () => {
        if (!addStaff) return true;
        if (!staffUsername.trim()) {
            Alert.alert('Error', 'Full name is required');
            return false;
        }
        if (!staffEmail.trim() || !EMAIL_REGEX.test(staffEmail.trim().toLowerCase())) {
            Alert.alert('Error', 'Please enter a valid staff email');
            return false;
        }
        if (!staffPassword.trim()) {
            Alert.alert('Error', 'Password is required');
            return false;
        }
        if (!createdClinicId) {
            Alert.alert('Error', 'Please create your clinic before adding staff');
            return false;
        }
        if (isLimited && (!DATE_REGEX.test(validFrom) || !DATE_REGEX.test(validTo))) {
            Alert.alert('Error', 'Please enter both validity dates in YYYY-MM-DD format');
            return false;
        }
        if (isLimited && validTo < validFrom) {
            Alert.alert('Error', 'Valid To cannot be before Valid From');
            return false;
        }
        return true;
    };

    const saveStaffOrSkip = async () => {
        if (!validateStaff()) return;

        if (!addStaff) {
            setStep(4);
            return;
        }

        setSaving(true);
        try {
            await createStaff({
                username: staffUsername.trim(),
                email: staffEmail.trim().toLowerCase(),
                password: staffPassword.trim(),
                role: staffRole,
                status: staffStatus,
                clinic_id: String(createdClinicId),
                is_limited: isLimited,
                valid_from: validFrom,
                valid_to: validTo,
                doctor_whatsapp_number: staffWhatsapp.trim(),
            });
            setStep(4);
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to create staff user');
        } finally {
            setSaving(false);
        }
    };

    const finishSetup = () => {
        navigation.replace('DoctorMain');
    };

    const renderInput = (
        label: string,
        value: string,
        onChangeText: (text: string) => void,
        placeholder: string,
        icon?: React.ReactNode,
        keyboardType: 'default' | 'email-address' | 'phone-pad' | 'number-pad' = 'default',
        multiline = false,
        secureTextEntry = false
    ) => (
        <View className="mb-4">
            <Text className="text-sm font-bold text-gray-700 mb-2">{label}</Text>
            <View className="flex-row items-center bg-gray-50 rounded-2xl px-4 border border-gray-200">
                {icon}
                <TextInput
                    className="flex-1 px-3 text-base text-slate-800 py-3.5"
                    placeholder={placeholder}
                    placeholderTextColor="#9ca3af"
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                    autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
                    multiline={multiline}
                    secureTextEntry={secureTextEntry}
                />
            </View>
        </View>
    );

    const renderChoice = <T extends string>(options: Array<{ label: string; value: T }>, value: T, onChange: (next: T) => void, activeColor = 'blue') => (
        <View className="flex-row gap-3 mb-4">
            {options.map((option) => {
                const selected = value === option.value;
                const isInactiveStatus = option.value === 'INACTIVE';
                const selectedClass =
                    activeColor === 'status'
                        ? isInactiveStatus
                            ? 'bg-red-50 border-red-500'
                            : 'bg-green-50 border-green-500'
                        : activeColor === 'green'
                            ? 'bg-green-50 border-green-500'
                            : 'bg-blue-50 border-blue-500';
                const selectedTextClass =
                    activeColor === 'status'
                        ? isInactiveStatus
                            ? 'text-red-700'
                            : 'text-green-700'
                        : activeColor === 'green'
                            ? 'text-green-700'
                            : 'text-blue-700';
                return (
                    <TouchableOpacity
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        activeOpacity={0.85}
                        className={`flex-1 py-3 rounded-xl border items-center ${selected ? selectedClass : 'bg-white border-gray-200'}`}
                    >
                        <Text className={`font-bold ${selected ? selectedTextClass : 'text-gray-500'}`}>{option.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    if (bootLoading) {
        return (
            <SafeAreaView className="flex-1 bg-blue-700">
                <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
                <View className="flex-1 bg-gray-50 items-center justify-center">
                    <ActivityIndicator size="large" color="#2563eb" />
                    <Text className="text-blue-700 font-semibold mt-3">Checking setup...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const onboardingScrollBottomInset = keyboardVisible
        ? Math.max(insets.bottom + 220, 280)
        : Math.max(insets.bottom + 32, 40);

    return (
        <SafeAreaView className="flex-1 bg-blue-700" edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
                <View className="bg-blue-700 px-6 pt-5 pb-8 rounded-b-[34px]">
                    <View className="w-16 h-16 bg-white rounded-3xl items-center justify-center self-center mb-4">
                        <BriefcaseMedical size={30} color="#1d4ed8" />
                    </View>
                    <Text className="text-white text-3xl font-extrabold text-center">Complete Setup</Text>
                    <Text className="text-blue-100 text-sm text-center mt-2">
                        Create your first clinic and working schedule before opening the dashboard.
                    </Text>
                    <View className="self-center mt-4 rounded-full bg-white/15 px-4 py-1.5">
                        <Text className="text-white font-bold text-xs">{`Step ${step} of 4`}</Text>
                    </View>
                </View>

                <ScrollView
                    className="flex-1 bg-gray-50 px-5 pt-5"
                    contentContainerStyle={{ paddingBottom: onboardingScrollBottomInset }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    showsVerticalScrollIndicator={false}
                    scrollIndicatorInsets={{ bottom: onboardingScrollBottomInset }}
                >
                    {step === 1 ? (
                        <View className="bg-white rounded-[26px] px-4 py-5 border border-gray-100">
                            <Text className="text-xl font-extrabold text-slate-800 mb-1">Enter Clinic Details</Text>
                            {renderInput('Clinic Name', clinicName, setClinicName, 'City Health Center', <Building2 size={19} color="#64748b" />)}
                            {renderInput('Phone Number', clinicPhone, setClinicPhone, '9876543210', <Phone size={19} color="#64748b" />, 'phone-pad')}
                            {renderInput('Location', clinicLocation, setClinicLocation, 'Full clinic address', <MapPin size={19} color="#64748b" />, 'default', true)}
                            <Text className="text-sm font-bold text-gray-700 mb-2">Status</Text>
                            {renderChoice<ClinicStatus>([
                                { label: 'ACTIVE', value: 'ACTIVE' },
                                { label: 'INACTIVE', value: 'INACTIVE' },
                            ], clinicStatus, setClinicStatus, 'status')}
                            <TouchableOpacity onPress={saveClinic} disabled={saving} className={`rounded-2xl py-4 items-center ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}>
                                {saving ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text className="text-white font-extrabold text-base">
                                        {createdClinicId ? 'Continue' : 'Create Clinic'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : step === 2 ? (
                        <View className="bg-white rounded-[26px] px-4 py-5 border border-gray-100">
                            <Text className="text-xl font-extrabold text-slate-800 mb-1">Working Schedule</Text>
                            <Text className="text-sm text-slate-500 mb-5">{createdClinicName || 'First clinic'}</Text>
                            {slots.map((slot, index) => (
                                <View key={slot.local_id} className="bg-gray-50 rounded-2xl border border-gray-200 px-3 py-4 mb-4">
                                    <View className="flex-row items-center justify-between mb-3">
                                        <Text className="font-bold text-gray-700">Slot {index + 1}</Text>
                                        {slots.length > 1 ? (
                                            <TouchableOpacity onPress={() => removeScheduleSlot(slot.local_id)} className="bg-red-50 px-3 py-1.5 rounded-xl">
                                                <Text className="text-red-500 font-semibold text-xs">Remove</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Day of Week</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                                        <View className="flex-row gap-2">
                                            {DAYS.map((day) => {
                                                const selected = slot.day_of_week.includes(day.value);
                                                return (
                                                    <TouchableOpacity
                                                        key={`${slot.local_id}-${day.value}`}
                                                        onPress={() => toggleSlotDay(slot.local_id, day.value)}
                                                        className={`w-10 h-10 rounded-full items-center justify-center border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}
                                                    >
                                                        <Text className={`font-black text-xs ${selected ? 'text-white' : 'text-gray-400'}`}>{day.label}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                    <View className="flex-row gap-3 mb-3">
                                        {(['start_time', 'end_time'] as const).map((field) => (
                                            <View key={`${slot.local_id}-${field}`} className="flex-1">
                                                <Text className="text-sm font-bold text-gray-700 mb-1.5">
                                                    {field === 'start_time' ? 'Start' : 'End'}
                                                </Text>
                                                <TouchableOpacity
                                                    onPress={() => openTimePicker(slot.local_id, field, slot[field])}
                                                    className="bg-white border border-gray-200 rounded-xl px-3 py-2.5"
                                                >
                                                    <Text className="text-gray-800 text-sm font-semibold">{formatTime(slot[field])}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Duration (mins)</Text>
                                    <View className="flex-row flex-wrap gap-2">
                                        {DURATIONS.map((duration) => {
                                            const selected = slot.slot_duration === duration;
                                            return (
                                                <TouchableOpacity
                                                    key={`${slot.local_id}-${duration}`}
                                                    onPress={() => patchSlot(slot.local_id, { slot_duration: duration })}
                                                    className={`py-2.5 px-4 items-center rounded-xl border ${selected ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-bold text-sm ${selected ? 'text-violet-700' : 'text-gray-500'}`}>{duration} min</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                        {(() => {
                                            const isCustom = !DURATIONS.includes(slot.slot_duration);
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        if (!isCustom) patchSlot(slot.local_id, { slot_duration: '' });
                                                    }}
                                                    className={`py-2.5 px-4 items-center rounded-xl border ${isCustom ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                                                >
                                                    <Text className={`font-bold text-sm ${isCustom ? 'text-violet-700' : 'text-gray-500'}`}>Custom</Text>
                                                </TouchableOpacity>
                                            );
                                        })()}
                                    </View>
                                    {!DURATIONS.includes(slot.slot_duration) ? (
                                        <View className="mt-2 flex-row items-center bg-violet-50 border border-violet-300 rounded-xl px-4 py-2.5">
                                            <TextInput
                                                keyboardType="number-pad"
                                                placeholder="e.g. 20"
                                                placeholderTextColor="#a78bfa"
                                                maxLength={3}
                                                value={slot.slot_duration}
                                                onChangeText={(text) => {
                                                    patchSlot(slot.local_id, { slot_duration: text.replace(/[^\d]/g, '') });
                                                }}
                                                className="flex-1 text-violet-800 font-bold text-base"
                                            />
                                            <Text className="text-violet-400 text-sm font-semibold ml-1">min</Text>
                                        </View>
                                    ) : null}
                                </View>
                            ))}
                            <TouchableOpacity onPress={addScheduleSlot} className="border border-dashed border-violet-300 bg-violet-50 rounded-2xl py-3 items-center mb-4">
                                <Text className="text-violet-600 font-bold">+ Add Another Slot</Text>
                            </TouchableOpacity>
                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setStep(1)} className="flex-1 rounded-2xl py-4 bg-gray-100 items-center">
                                    <Text className="text-gray-700 font-bold">Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={saveSchedule} disabled={saving} className={`flex-1 rounded-2xl py-4 items-center ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}>
                                    {saving ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text className="text-white font-extrabold">
                                            {scheduleSaved ? 'Continue' : 'Save Schedule'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : step === 3 ? (
                        <View className="bg-white rounded-[26px] px-4 py-5 border border-gray-100">
                            <View className="flex-row items-center mb-2">
                                <Users size={22} color="#2563eb" />
                                <Text className="text-xl font-extrabold text-slate-800 ml-2">Staff Setup</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        Alert.alert(
                                            'Staff Setup',
                                            'Staff accounts are for receptionists or assistants who help manage appointments, live queue, and clinic work based on the access role you choose.'
                                        );
                                    }}
                                    className="ml-2 h-6 w-6 rounded-full bg-blue-50 items-center justify-center"
                                    activeOpacity={0.8}
                                >
                                    <Info size={15} color="#2563eb" />
                                </TouchableOpacity>
                            </View>
                            <View className="flex-row items-center justify-between bg-blue-50 rounded-2xl px-4 py-3 mb-5">
                                <View className="flex-1 pr-4">
                                    <Text className="font-bold text-slate-800">Add staff now</Text>
                                    <Text className="text-xs text-slate-500 mt-1">Optional</Text>
                                </View>
                                <Switch value={addStaff} onValueChange={setAddStaff} />
                            </View>
                            {addStaff ? (
                                <>
                                    {renderInput('Full Name', staffUsername, setStaffUsername, "Staff's full name", <User size={19} color="#64748b" />)}
                                    {renderInput('Email', staffEmail, setStaffEmail, 'user@example.com', <Mail size={19} color="#64748b" />, 'email-address')}
                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Password</Text>
                                        <View className="flex-row items-center bg-gray-50 rounded-2xl px-4 border border-gray-200">
                                            <ShieldCheck size={19} color="#64748b" />
                                            <TextInput
                                                className="flex-1 px-3 text-base text-slate-800 py-3.5"
                                                placeholder="Enter password"
                                                placeholderTextColor="#9ca3af"
                                                value={staffPassword}
                                                onChangeText={setStaffPassword}
                                                secureTextEntry={!showStaffPassword}
                                            />
                                            <TouchableOpacity onPress={() => setShowStaffPassword((prev) => !prev)} className="p-2" activeOpacity={0.8}>
                                                {showStaffPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View className="flex-row items-center mb-2">
                                        <TouchableOpacity
                                            onPress={() => {
                                                Alert.alert(
                                                    'Role Access',
                                                    'Have Access: can manage appointments, live TV queue and prescriptions.\n\nViewer: can only view appointments with limited control.'
                                                );
                                            }}
                                            className="mr-2 h-6 w-6 rounded-full bg-blue-50 items-center justify-center"
                                            activeOpacity={0.8}
                                        >
                                            <Info size={15} color="#2563eb" />
                                        </TouchableOpacity>
                                        <Text className="text-sm font-bold text-gray-700">Role Access</Text>
                                    </View>
                                    {renderChoice<StaffRole>([
                                        { label: 'Have Access', value: 'HAVE_ACCESS' },
                                        { label: 'Viewer', value: 'VIEWER' },
                                    ], staffRole, setStaffRole)}
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Status</Text>
                                    {renderChoice<StaffStatus>([
                                        { label: 'Active', value: 'ACTIVE' },
                                        { label: 'Inactive', value: 'INACTIVE' },
                                    ], staffStatus, setStaffStatus, 'status')}
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Clinic</Text>
                                    {renderChoice([
                                        { label: createdClinicName || 'First Clinic', value: 'FIRST_CLINIC' },
                                    ], staffClinicScope, setStaffClinicScope)}
                                    {renderInput('Doctor WhatsApp Number', staffWhatsapp, setStaffWhatsapp, '9876543210', <Phone size={19} color="#64748b" />, 'phone-pad')}
                                    <View className="flex-row items-center justify-between bg-gray-50 rounded-2xl px-4 py-3 mb-4 border border-gray-200">
                                        <View className="flex-1 pr-4">
                                            <Text className="font-bold text-slate-800">Limited Time Access</Text>
                                            <Text className="text-xs text-slate-500 mt-1">Restrict login to a date range.</Text>
                                        </View>
                                        <Switch value={isLimited} onValueChange={setIsLimited} />
                                    </View>
                                    {isLimited ? (
                                        <View className="mb-4">
                                            <Text className="text-sm font-bold text-gray-700 mb-2">Valid From</Text>
                                            <TouchableOpacity
                                                onPress={() => setDatePickerField('valid_from')}
                                                activeOpacity={0.85}
                                                className={`bg-gray-50 border rounded-2xl px-4 py-3.5 mb-3 flex-row items-center justify-between ${datePickerField === 'valid_from' ? 'border-blue-500' : 'border-gray-200'}`}
                                            >
                                                <Text className={`text-base ${validFrom ? 'text-gray-800' : 'text-gray-400'}`}>
                                                    {validFrom || 'Select start date'}
                                                </Text>
                                                <CalendarDays size={18} color="#64748b" />
                                            </TouchableOpacity>
                                            {datePickerField === 'valid_from' ? (
                                                <View className="mb-4">
                                                    <CalendarPicker
                                                        selectedDate={validFrom}
                                                        minDate={todayYMD}
                                                        onSelect={(date) => selectValidityDate('valid_from', date)}
                                                    />
                                                </View>
                                            ) : null}

                                            <Text className="text-sm font-bold text-gray-700 mb-2">Valid To</Text>
                                            <TouchableOpacity
                                                onPress={() => setDatePickerField('valid_to')}
                                                activeOpacity={0.85}
                                                className={`bg-gray-50 border rounded-2xl px-4 py-3.5 flex-row items-center justify-between ${datePickerField === 'valid_to' ? 'border-blue-500' : 'border-gray-200'}`}
                                            >
                                                <Text className={`text-base ${validTo ? 'text-gray-800' : 'text-gray-400'}`}>
                                                    {validTo || 'Select end date'}
                                                </Text>
                                                <CalendarDays size={18} color="#64748b" />
                                            </TouchableOpacity>
                                            {datePickerField === 'valid_to' ? (
                                                <View className="mt-3">
                                                    <CalendarPicker
                                                        selectedDate={validTo || validToMinDate}
                                                        minDate={validToMinDate}
                                                        onSelect={(date) => selectValidityDate('valid_to', date)}
                                                    />
                                                </View>
                                            ) : null}
                                        </View>
                                    ) : null}
                                </>
                            ) : null}
                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setStep(2)} className="flex-1 rounded-2xl py-4 bg-gray-100 items-center">
                                    <Text className="text-gray-700 font-bold">Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={saveStaffOrSkip} disabled={saving} className={`flex-1 rounded-2xl py-4 items-center ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}>
                                    {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-extrabold">{addStaff ? 'Create Staff' : 'Continue'}</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View className="bg-white rounded-[26px] px-5 py-8 border border-gray-100 items-center">
                            <View className="w-16 h-16 bg-emerald-500 rounded-3xl items-center justify-center mb-4">
                                <Check size={30} color="#ffffff" />
                            </View>
                            <Text className="text-2xl font-extrabold text-slate-800 text-center">Setup Complete</Text>
                            <Text className="text-sm text-slate-500 text-center mt-2 mb-6">
                                Your clinic and working schedule are ready. You can manage more details from the dashboard.
                            </Text>
                            <TouchableOpacity onPress={finishSetup} className="w-full bg-blue-600 rounded-2xl py-4 items-center">
                                <View className="flex-row items-center">
                                    <Text className="text-white font-extrabold text-base mr-2">Go to Dashboard</Text>
                                    <ArrowRight size={18} color="#ffffff" />
                                </View>
                            </TouchableOpacity>
                        </View>
                    )}
                    <View className="h-10" />
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal
                animationType="fade"
                transparent
                visible={timePickerVisible}
                onRequestClose={() => {
                    setTimePickerVisible(false);
                    setTimePickerTarget(null);
                }}
            >
                <View className="flex-1 justify-center items-center bg-black/40 px-5">
                    <View className="w-full bg-white rounded-2xl p-5">
                        <Text className="text-lg font-bold text-gray-800 mb-1">Select Time</Text>
                        <Text className="text-xs text-gray-400 mb-4">12-hour format</Text>

                        <View className="flex-row gap-3 mb-4">
                            <View className="flex-1">
                                <Text className="text-xs font-semibold text-gray-500 mb-1.5">Hour</Text>
                                <View className="flex-row items-center">
                                    <TouchableOpacity
                                        onPress={() => nudgePicker('hour', -1)}
                                        className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-l-xl"
                                    >
                                        <Text className="text-violet-600 font-bold">-</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={String(pickerHour)}
                                        onChangeText={(text) => {
                                            const next = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
                                            if (!Number.isNaN(next)) setPickerHour(Math.min(12, Math.max(1, next)));
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
                                        <Text className="text-violet-600 font-bold">-</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={pickerMinute}
                                        onChangeText={(text) => {
                                            const next = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
                                            if (Number.isNaN(next)) {
                                                setPickerMinute('00');
                                                return;
                                            }
                                            setPickerMinute(String(Math.min(59, Math.max(0, next))).padStart(2, '0'));
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

                        <View className="flex-row gap-2 mb-4">
                            {['00', '15', '30', '45'].map((minute) => {
                                const selected = pickerMinute === minute;
                                return (
                                    <TouchableOpacity
                                        key={minute}
                                        onPress={() => setPickerMinute(minute)}
                                        className={`flex-1 py-2 items-center rounded-xl border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`font-semibold text-sm ${selected ? 'text-white' : 'text-gray-500'}`}>:{minute}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View className="flex-row gap-2 mb-4">
                            {(['AM', 'PM'] as const).map((period) => {
                                const selected = pickerPeriod === period;
                                return (
                                    <TouchableOpacity
                                        key={period}
                                        onPress={() => setPickerPeriod(period)}
                                        className={`flex-1 py-2.5 items-center rounded-xl border ${selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`font-bold ${selected ? 'text-white' : 'text-gray-500'}`}>{period}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View className="bg-violet-50 border border-violet-100 rounded-xl py-2.5 mb-4 items-center">
                            <Text className="text-violet-700 font-bold text-xl tracking-widest">
                                {String(pickerHour).padStart(2, '0')}:{pickerMinute} {pickerPeriod}
                            </Text>
                        </View>

                        <View className="flex-row gap-2">
                            <TouchableOpacity
                                onPress={() => {
                                    setTimePickerVisible(false);
                                    setTimePickerTarget(null);
                                }}
                                className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                            >
                                <Text className="text-gray-500 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={applyPickedTime} className="flex-1 py-3 rounded-xl bg-violet-600 items-center">
                                <Text className="text-white font-bold">Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
