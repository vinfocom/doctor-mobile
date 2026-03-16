import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Switch,
    ActivityIndicator,
    Alert,
    StatusBar,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useAuthSession } from '../context/AuthSessionContext';
import { createStaff, updateStaff } from '../api/staff';
import { getClinics } from '../api/clinics';
import { ArrowLeft, CalendarDays, Check, ChevronDown } from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

type Nav = NativeStackNavigationProp<RootStackParamList, 'StaffForm'>;
type ScreenRoute = RouteProp<RootStackParamList, 'StaffForm'>;

type Clinic = {
    clinic_id: number;
    clinic_name: string;
};

const formatDateValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseDateValue = (value: string) => {
    if (!value) return new Date();
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, (month || 1) - 1, day || 1);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

function Dropdown({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const selected = options.find((item) => item.value === value);

    return (
        <View>
            <Text className="text-sm font-bold text-gray-700 mb-2">{label}</Text>
            <TouchableOpacity
                onPress={() => setOpen((prev) => !prev)}
                className={`bg-white border px-4 py-3.5 rounded-2xl flex-row items-center justify-between ${open ? 'border-blue-500' : 'border-gray-200'}`}
            >
                <Text className={`text-base ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
                    {selected?.label || `Select ${label.toLowerCase()}`}
                </Text>
                <ChevronDown size={18} color="#9ca3af" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
            </TouchableOpacity>
            {open && (
                <View className="mt-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    {options.map((option, index) => (
                        <TouchableOpacity
                            key={option.value || `empty-${index}`}
                            onPress={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                            className={`px-4 py-3.5 ${index < options.length - 1 ? 'border-b border-gray-100' : ''}`}
                        >
                            <Text className={`text-sm font-medium ${option.value === value ? 'text-blue-700' : 'text-gray-700'}`}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

export default function StaffFormScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<ScreenRoute>();
    const { role } = useAuthSession();
    const isEdit = route.params.mode === 'edit';
    const initialStaff = route.params.staff;
    const [clinics, setClinics] = React.useState<Clinic[]>([]);
    const [loadingClinics, setLoadingClinics] = React.useState(true);
    const [saving, setSaving] = React.useState(false);

    const [username, setUsername] = React.useState(initialStaff?.name || '');
    const [email, setEmail] = React.useState(initialStaff?.email || '');
    const [password, setPassword] = React.useState('');
    const [staffRole, setStaffRole] = React.useState(initialStaff?.role || 'VIEWER');
    const [status, setStatus] = React.useState(initialStaff?.status || 'ACTIVE');
    const [clinicId, setClinicId] = React.useState(initialStaff?.clinic_id ? String(initialStaff.clinic_id) : '');
    const [doctorWhatsAppNumber, setDoctorWhatsAppNumber] = React.useState(initialStaff?.doctor_whatsapp_number || '');
    const [isLimited, setIsLimited] = React.useState(Boolean(initialStaff?.valid_from || initialStaff?.valid_to));
    const [validFrom, setValidFrom] = React.useState(initialStaff?.valid_from ? String(initialStaff.valid_from).slice(0, 10) : '');
    const [validTo, setValidTo] = React.useState(initialStaff?.valid_to ? String(initialStaff.valid_to).slice(0, 10) : '');
    const [pickerField, setPickerField] = React.useState<'valid_from' | 'valid_to' | null>(null);

    React.useEffect(() => {
        const loadClinics = async () => {
            try {
                const response = await getClinics();
                setClinics(response.clinics || []);
            } catch (error: any) {
                Alert.alert('Error', error?.response?.data?.error || 'Failed to load clinics');
            } finally {
                setLoadingClinics(false);
            }
        };

        loadClinics().catch(() => {
            setLoadingClinics(false);
        });
    }, []);

    const clinicOptions = React.useMemo(
        () => [{ label: 'All Clinics', value: '' }, ...clinics.map((clinic) => ({ label: clinic.clinic_name, value: String(clinic.clinic_id) }))],
        [clinics]
    );

    const pickerValue = React.useMemo(() => {
        if (pickerField === 'valid_to') return parseDateValue(validTo);
        return parseDateValue(validFrom);
    }, [pickerField, validFrom, validTo]);

    const handleDateChange = React.useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS !== 'ios') {
            setPickerField(null);
        }

        if (event.type !== 'set' || !selectedDate || !pickerField) {
            return;
        }

        const formatted = formatDateValue(selectedDate);
        if (pickerField === 'valid_from') {
            setValidFrom(formatted);
            if (validTo && validTo < formatted) {
                setValidTo(formatted);
            }
            return;
        }

        setValidTo(formatted);
    }, [pickerField, validTo]);

    const openDatePicker = React.useCallback((field: 'valid_from' | 'valid_to') => {
        setPickerField(field);
    }, []);

    const handleSubmit = React.useCallback(async () => {
        if (!username.trim()) {
            Alert.alert('Error', 'Username is required');
            return;
        }
        if (!isEdit && !email.trim()) {
            Alert.alert('Error', 'Email is required');
            return;
        }
        if (!isEdit && !password.trim()) {
            Alert.alert('Error', 'Password is required');
            return;
        }
        if (isLimited && (!validFrom || !validTo)) {
            Alert.alert('Error', 'Please select both validity dates');
            return;
        }

        setSaving(true);
        try {
            if (isEdit && initialStaff?.staff_id) {
                await updateStaff(initialStaff.staff_id, {
                    username: username.trim(),
                    role: staffRole,
                    status,
                    clinic_id: clinicId,
                    is_limited: isLimited,
                    valid_from: validFrom,
                    valid_to: validTo,
                    doctor_whatsapp_number: doctorWhatsAppNumber.trim(),
                });
            } else {
                await createStaff({
                    username: username.trim(),
                    email: email.trim(),
                    password: password.trim(),
                    role: staffRole,
                    status,
                    clinic_id: clinicId,
                    is_limited: isLimited,
                    valid_from: validFrom,
                    valid_to: validTo,
                    doctor_whatsapp_number: doctorWhatsAppNumber.trim(),
                });
            }

            Alert.alert('Success', isEdit ? 'Staff user updated successfully' : 'Staff user created successfully');
            navigation.goBack();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || (isEdit ? 'Failed to update user' : 'Failed to create user'));
        } finally {
            setSaving(false);
        }
    }, [clinicId, doctorWhatsAppNumber, email, initialStaff?.staff_id, isEdit, isLimited, navigation, password, staffRole, status, username, validFrom, validTo]);

    if (role !== 'DOCTOR') {
        return (
            <SafeAreaView className="flex-1 bg-gray-50">
                <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
                <View className="flex-1 items-center justify-center px-6">
                    <Text className="text-lg font-bold text-gray-800">Doctor access only</Text>
                    <Text className="text-sm text-gray-500 text-center mt-2">Only doctors can create or edit clinic staff users.</Text>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        className="mt-5 bg-blue-600 rounded-xl px-5 py-3"
                    >
                        <Text className="text-white font-semibold">Go back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-blue-700">
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <View className="flex-1 bg-gray-50">
                <View className="bg-blue-700 px-5 pt-4 pb-8 rounded-b-3xl">
                    <View className="flex-row items-center justify-between">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="bg-white/15 p-2.5 rounded-full">
                            <ArrowLeft size={18} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View className="mt-5">
                        <Text className="text-white text-3xl font-bold">{isEdit ? 'Edit Staff User' : 'Add Staff User'}</Text>
                        <Text className="text-blue-100 text-sm mt-1">Manage clinic access exactly like the web dashboard.</Text>
                    </View>
                </View>

                <ScrollView className="flex-1 px-4 pt-5" showsVerticalScrollIndicator={false}>
                    <View className="bg-white rounded-2xl px-4 py-4 mb-4 border border-gray-100">
                        <Text className="text-gray-800 font-bold text-base mb-4">Basic Information</Text>

                        <Text className="text-sm font-bold text-gray-700 mb-2">Username</Text>
                        <TextInput
                            className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-gray-800 text-base mb-4"
                            placeholder="Enter full name"
                            value={username}
                            onChangeText={setUsername}
                        />

                        <Text className="text-sm font-bold text-gray-700 mb-2">Email</Text>
                        <TextInput
                            editable={!isEdit}
                            className={`border rounded-2xl px-4 py-3.5 text-base mb-4 ${isEdit ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
                            placeholder="user@example.com"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        {!isEdit && (
                            <>
                                <Text className="text-sm font-bold text-gray-700 mb-2">Password</Text>
                                <TextInput
                                    className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-gray-800 text-base mb-4"
                                    placeholder="Enter password"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                />
                            </>
                        )}

                        <Dropdown
                            label="Role"
                            value={staffRole}
                            onChange={setStaffRole}
                            options={[
                                { label: 'Have Access', value: 'HAVE_ACCESS' },
                                { label: 'Viewer', value: 'VIEWER' },
                            ]}
                        />

                        <View className="mt-4" />

                        <Dropdown
                            label="Status"
                            value={status}
                            onChange={setStatus}
                            options={[
                                { label: 'Active', value: 'ACTIVE' },
                                { label: 'Inactive', value: 'INACTIVE' },
                            ]}
                        />

                        <View className="mt-4" />

                        {loadingClinics ? (
                            <View className="py-4 items-center">
                                <ActivityIndicator size="small" color="#2563eb" />
                                <Text className="text-gray-400 text-sm mt-2">Loading clinics...</Text>
                            </View>
                        ) : (
                            <Dropdown
                                label="Clinic"
                                value={clinicId}
                                onChange={setClinicId}
                                options={clinicOptions}
                            />
                        )}

                        <View className="mt-4" />

                        <Text className="text-sm font-bold text-gray-700 mb-2">Doctor WhatsApp Number</Text>
                        <TextInput
                            className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-gray-800 text-base"
                            placeholder="+91 98765 43210"
                            value={doctorWhatsAppNumber}
                            onChangeText={setDoctorWhatsAppNumber}
                            keyboardType="phone-pad"
                        />
                    </View>

                    <View className="bg-white rounded-2xl px-4 py-4 mb-4 border border-gray-100">
                        <Text className="text-gray-800 font-bold text-base mb-4">Validity Period</Text>

                        <View className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                            <View className="flex-1 pr-4">
                                <Text className="text-sm font-semibold text-gray-800">Limited Time Access</Text>
                                <Text className="text-xs text-gray-500 mt-1">Restrict login to a date range.</Text>
                            </View>
                            <Switch value={isLimited} onValueChange={setIsLimited} />
                        </View>

                        {isLimited && (
                            <View className="mt-4">
                                <Text className="text-sm font-bold text-gray-700 mb-2">Valid From</Text>
                                <TouchableOpacity
                                    onPress={() => openDatePicker('valid_from')}
                                    className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 mb-4 flex-row items-center justify-between"
                                >
                                    <Text className={`text-base ${validFrom ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {validFrom || 'Select start date'}
                                    </Text>
                                    <CalendarDays size={18} color="#6b7280" />
                                </TouchableOpacity>

                                <Text className="text-sm font-bold text-gray-700 mb-2">Valid To</Text>
                                <TouchableOpacity
                                    onPress={() => openDatePicker('valid_to')}
                                    className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
                                >
                                    <Text className={`text-base ${validTo ? 'text-gray-800' : 'text-gray-400'}`}>
                                        {validTo || 'Select end date'}
                                    </Text>
                                    <CalendarDays size={18} color="#6b7280" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        onPress={handleSubmit}
                        disabled={saving}
                        className={`rounded-2xl py-4 items-center justify-center mb-10 ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <View className="flex-row items-center">
                                <Check size={18} color="#fff" />
                                <Text className="text-white font-bold text-base ml-2">
                                    {isEdit ? 'Save Changes' : 'Create User'}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </ScrollView>

                {pickerField && (
                    <DateTimePicker
                        value={pickerValue}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleDateChange}
                        minimumDate={pickerField === 'valid_to' && validFrom ? parseDateValue(validFrom) : undefined}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}
