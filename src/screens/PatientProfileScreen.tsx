import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    TextInput,
    Linking,
} from 'react-native';
import {
    User,
    Phone,
    LogOut,
    Pencil,
    Check,
    X,
    Calendar,
    Users,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getPatientProfile, updatePatientProfile } from '../api/auth';
import { removeToken } from '../api/token';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthSession } from '../context/AuthSessionContext';
import { APP_VERSION } from '../config/env';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PatientProfile'>;

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export default function PatientProfileScreen() {
    const navigation = useNavigation<Nav>();
    const { clearSession } = useAuthSession();
    const [patient, setPatient] = useState<any>(null);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    // Form state
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const data = await getPatientProfile();
            const p = data.patient;
            setPatient(p);
            setDoctors(data.doctors || []);
            setFullName(p?.full_name || '');
            setPhone(p?.phone || '');
            setAge(p?.age ? String(p.age) : '');
            setGender(p?.gender || '');
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updatePatientProfile({
                full_name: fullName,
                phone,
                age: age ? parseInt(age, 10) : undefined,
                gender,
            });
            Alert.alert('Success', 'Profile updated successfully');
            setEditing(false);
            loadProfile();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setFullName(patient?.full_name || '');
        setPhone(patient?.phone || '');
        setAge(patient?.age ? String(patient.age) : '');
        setGender(patient?.gender || '');
        setEditing(false);
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await removeToken();
                    clearSession();
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                },
            },
        ]);
    };

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
            <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>

                {/* Header */}
                <Animated.View entering={FadeInDown.duration(600).springify()} className="bg-blue-700 px-6 pt-8 pb-10">
                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-1">
                            <Text className="text-blue-200 text-sm font-medium">Patient Profile</Text>
                            <Text className="text-white text-3xl font-bold mt-1">
                                {patient?.full_name || 'Patient'}
                            </Text>
                            {(patient?.age || patient?.gender) && (
                                <Text className="text-blue-200 text-sm mt-1">
                                    {[patient.gender, patient.age ? `${patient.age} yrs` : null].filter(Boolean).join(' • ')}
                                </Text>
                            )}
                        </View>
                        <View className="bg-white w-16 h-16 rounded-full items-center justify-center border-4 border-blue-500"
                            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                        >
                            <User size={32} color="#1d4ed8" />
                        </View>
                    </View>
                    <View className="flex-row gap-2">
                        {!editing ? (
                            <TouchableOpacity
                                onPress={() => setEditing(true)}
                                className="flex-row items-center bg-white/20 px-4 py-2 rounded-full"
                            >
                                <Pencil size={14} color="#fff" />
                                <Text className="text-white text-sm font-semibold ml-1">Edit Profile</Text>
                            </TouchableOpacity>
                        ) : (
                            <>
                                <TouchableOpacity
                                    onPress={handleSave}
                                    disabled={saving}
                                    className="flex-row items-center bg-green-400 px-4 py-2 rounded-full"
                                >
                                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check size={14} color="#fff" />}
                                    <Text className="text-white text-sm font-semibold ml-1">Save</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleCancel}
                                    className="flex-row items-center bg-white/20 px-4 py-2 rounded-full"
                                >
                                    <X size={14} color="#fff" />
                                    <Text className="text-white text-sm font-semibold ml-1">Cancel</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </Animated.View>

                <View className="px-5 mt-6">
                    <Animated.Text entering={FadeInUp.delay(300).duration(500)} className="text-gray-700 font-bold text-base mb-3">
                        Profile Info
                    </Animated.Text>

                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        {editing ? (
                            <View className="space-y-3 mb-3">
                                {/* Full Name */}
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Full Name</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={fullName}
                                        onChangeText={setFullName}
                                        placeholder="Your full name"
                                    />
                                </View>
                                {/* Phone */}
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Phone</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={phone}
                                        onChangeText={setPhone}
                                        placeholder="+91 9876543210"
                                        keyboardType="phone-pad"
                                    />
                                </View>
                                {/* Age */}
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Age</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={age}
                                        onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
                                        placeholder="e.g. 28"
                                        keyboardType="number-pad"
                                        maxLength={3}
                                    />
                                </View>
                                {/* Gender */}
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-2">Gender</Text>
                                    <View className="flex-row flex-wrap gap-2">
                                        {GENDER_OPTIONS.map((g) => (
                                            <TouchableOpacity
                                                key={g}
                                                onPress={() => setGender(g)}
                                                className={`px-3 py-1.5 rounded-full border ${gender === g ? 'bg-blue-600 border-blue-600' : 'bg-gray-50 border-gray-300'}`}
                                            >
                                                <Text className={`text-xs font-semibold ${gender === g ? 'text-white' : 'text-gray-600'}`}>{g}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><User size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Full Name</Text>
                                        <Text className="text-base text-gray-800 font-medium">{patient?.full_name || 'N/A'}</Text>
                                    </View>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><Phone size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Phone</Text>
                                        <Text className="text-base text-gray-800 font-medium">{patient?.phone || 'N/A'}</Text>
                                    </View>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><Calendar size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Age</Text>
                                        <Text className="text-base text-gray-800 font-medium">{patient?.age ? `${patient.age} years` : 'N/A'}</Text>
                                    </View>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><Users size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Gender</Text>
                                        <Text className="text-base text-gray-800 font-medium">{patient?.gender || 'N/A'}</Text>
                                    </View>
                                </View>
                            </>
                        )}
                    </Animated.View>

                    {/* My Doctors (read-only) */}
                    {doctors.length > 0 && (
                        <>
                            <Animated.Text entering={FadeInUp.delay(500).duration(500)} className="text-gray-700 font-bold text-base mt-4 mb-3">
                                My Doctors
                            </Animated.Text>
                            <Animated.View entering={FadeInUp.delay(600).duration(500)}>
                                {doctors.map((d, idx) => (
                                    <View key={d.doctor_id || idx} className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-center" style={{ elevation: 2 }}>
                                        <View className="bg-blue-100 w-10 h-10 rounded-full items-center justify-center mr-3">
                                            <User size={18} color="#1d4ed8" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-gray-800 font-semibold">{d.doctor_name || 'Doctor'}</Text>
                                            <Text className="text-gray-500 text-xs mt-0.5">{d.specialization || 'General'}</Text>
                                        </View>
                                        {d.phone && (
                                            <View className="flex-row items-center">
                                                <Phone size={13} color="#6b7280" />
                                                <Text className="text-gray-500 text-xs ml-1">{d.phone}</Text>
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </Animated.View>
                        </>
                    )}

                    {/* Logout */}
                    <Animated.View entering={FadeInUp.delay(700).duration(500)} className="mt-4 mb-10">
                        <TouchableOpacity
                            onPress={handleLogout}
                            activeOpacity={0.7}
                            className="border border-red-200 bg-red-50 rounded-2xl py-4 items-center flex-row justify-center"
                        >
                            <LogOut size={20} color="#ef4444" style={{ marginRight: 8 }} />
                            <Text className="text-red-500 font-bold text-lg">Logout</Text>
                        </TouchableOpacity>
                        <Text className="text-center text-xs text-gray-400 mt-4">
                            Version {APP_VERSION}
                        </Text>
                        <TouchableOpacity onPress={() => Linking.openURL('https://dapto.vinfocom.co.in/privacy-policy')}>
                            <Text className="text-center text-xs text-blue-600 mt-2">
                                Privacy Policy
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
