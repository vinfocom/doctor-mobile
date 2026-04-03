import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    TextInput,
    Modal,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Image,
    Linking,
} from 'react-native';
import {
    User,
    Phone,
    Stethoscope,
    MessageCircle,
    LogOut,
    PhoneOff,
    Plus,
    Pencil,
    Trash2,
    X,
    Check,
    CalendarDays,
    BedDouble,
    Camera,
    Upload,
    BadgeCheck,
    ChevronLeft,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getProfile, updateProfile } from '../api/auth';
import { getLeaves, addLeave, deleteLeave } from '../api/leaves';
import { removeToken } from '../api/token';
import { uploadDoctorFile } from '../api/uploads';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuthSession } from '../context/AuthSessionContext';
import { APP_VERSION } from '../config/env';

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

// ─── Inline scroll-wheel date picker ──────────────────────────────────────────
const ITEM_H = 44;
const VISIBLE = 3; // rows visible; middle row = selected

const WheelColumn = ({ items, selectedIndex, onSelect }: {
    items: string[];
    selectedIndex: number;
    onSelect: (idx: number) => void;
}) => {
    const ref = useRef<ScrollView>(null);
    const isScrollingRef = useRef(false);

    // Only jump to position when the modal first opens, not on every selectedIndex change
    // (prevents fighting the user while they scroll)
    const didMountRef = useRef(false);
    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            setTimeout(() => {
                ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
            }, 50);
        }
    }, []);

    // Snap after momentum ends (finger flick)
    const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        isScrollingRef.current = false;
        const y = e.nativeEvent?.contentOffset?.y ?? 0;
        const idx = Math.round(y / ITEM_H);
        const clamped = Math.max(0, Math.min(items.length - 1, idx));
        onSelect(clamped);
    }, [items, onSelect]);

    // Snap after slow drag-release (no momentum)
    const onDragEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent?.contentOffset?.y ?? 0;
        const idx = Math.round(y / ITEM_H);
        const clamped = Math.max(0, Math.min(items.length - 1, idx));
        onSelect(clamped);
        ref.current?.scrollTo({ y: clamped * ITEM_H, animated: true });
    }, [items, onSelect]);

    return (
        <View style={{ flex: 1, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
            {/* selection highlight */}
            <View style={{
                position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H,
                backgroundColor: '#eff6ff', borderRadius: 10, zIndex: 0,
                borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#bfdbfe',
            }} />
            <ScrollView
                ref={ref}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_H}
                snapToAlignment="start"
                decelerationRate={0.85}
                onMomentumScrollEnd={onMomentumEnd}
                onScrollEndDrag={onDragEnd}
                onScrollBeginDrag={() => { isScrollingRef.current = true; }}
                contentContainerStyle={{ paddingVertical: ITEM_H }}
                scrollEventThrottle={16}
            >
                {items.map((item, idx) => {
                    const active = idx === selectedIndex;
                    return (
                        <View key={idx} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{
                                fontSize: active ? 17 : 14,
                                fontWeight: active ? '800' : '500',
                                color: active ? '#1d4ed8' : '#9ca3af',
                            }}>{item}</Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};
// ──────────────────────────────────────────────────────────────────────────────

interface WhatsAppNumber {
    id?: number;
    whatsapp_number: string;
    is_primary: boolean;
}

interface DoctorProfile {
    doctor_id: number;
    doctor_name?: string | null;
    phone?: string | null;
    specialization?: string | null;
    whatsapp_number?: string | null;
    whatsapp_numbers?: WhatsAppNumber[];
    chat_id?: string | null;
    education?: string | null;
    address?: string | null;
    registration_no?: string | null;
    gst_number?: string | null;
    pan_number?: string | null;
    telegram_userid?: string | null;
    profile_pic_url?: string | null;
    document_url?: string | null;
    status?: string | null;
    num_clinics?: number | null;
}

const ProfileScreen = () => {
    const navigation = useNavigation<ProfileScreenNavigationProp>();
    const { role, staff_role, staff_clinic_id, staff_doctor_id, name, email, isLoading: sessionLoading, clearSession } = useAuthSession();
    const isClinicStaff = role === 'CLINIC_STAFF';
    const [profile, setProfile] = useState<DoctorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    // Editable fields
    const [doctorName, setDoctorName] = useState('');
    const [phone, setPhone] = useState('');
    const [specialization, setSpecialization] = useState('');
    const [chatId, setChatId] = useState('');
    const [education, setEducation] = useState('');
    const [address, setAddress] = useState('');
    const [registrationNo, setRegistrationNo] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [panNumber, setPanNumber] = useState('');
    const [telegramUserid, setTelegramUserid] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState('');
    const [documentUrl, setDocumentUrl] = useState('');
    const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([]);
    const [showAddWa, setShowAddWa] = useState(false);
    const [newWaNumber, setNewWaNumber] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [uploadingDocument, setUploadingDocument] = useState(false);

    // Leaves state
    interface LeaveItem { leave_id: number; date: string; reason: string; }
    const [leaves, setLeaves] = useState<LeaveItem[]>([]);
    const [showAddLeave, setShowAddLeave] = useState(false);
    const [leaveDate, setLeaveDate] = useState('');
    const [leaveReason, setLeaveReason] = useState('');
    const [savingLeave, setSavingLeave] = useState(false);

    // Date picker wheel state
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const currentYear = nowIST.getUTCFullYear();
    const years = Array.from({ length: 5 }, (_, i) => String(currentYear + i));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [pickerYear, setPickerYear] = useState(0);   // index into years[]
    const [pickerMonth, setPickerMonth] = useState(nowIST.getUTCMonth()); // 0-indexed
    const [pickerDay, setPickerDay] = useState(nowIST.getUTCDate() - 1);  // 0-indexed
    const daysInPickerMonth = new Date(currentYear + Number(pickerYear), pickerMonth + 1, 0).getDate();
    const days = Array.from({ length: daysInPickerMonth }, (_, i) => String(i + 1).padStart(2, '0'));

    useEffect(() => {
        if (isClinicStaff) {
            setLoading(false);
            return;
        }
        fetchProfile();
        fetchLeaves();
    }, [isClinicStaff]);

    const fetchLeaves = async () => {
        try {
            const data = await getLeaves();
            setLeaves(data);
        } catch (e) { console.error(e); }
    };

    const fetchProfile = async () => {
        try {
            const data = await getProfile();
            const p = data.doctor as DoctorProfile;
            setProfile(p);
            setDoctorName(p?.doctor_name || '');
            setPhone(p?.phone || '');
            setSpecialization(p?.specialization || '');
            setChatId(p?.chat_id ? String(p.chat_id) : '');
            setEducation(p?.education || '');
            setAddress(p?.address || '');
            setRegistrationNo(p?.registration_no || '');
            setGstNumber(p?.gst_number || '');
            setPanNumber(p?.pan_number || '');
            setTelegramUserid(p?.telegram_userid || '');
            setProfilePicUrl(p?.profile_pic_url || '');
            setDocumentUrl(p?.document_url || '');
            setWhatsappNumbers(p?.whatsapp_numbers || (p?.whatsapp_number ? [{ whatsapp_number: p.whatsapp_number, is_primary: true }] : []));
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to fetch profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateProfile({
                doctor_name: doctorName,
                phone,
                specialization,
                chat_id: chatId,
                education,
                address,
                registration_no: registrationNo,
                gst_number: gstNumber,
                pan_number: panNumber,
                telegram_userid: telegramUserid,
                profile_pic_url: profilePicUrl,
                document_url: documentUrl,
                whatsapp_numbers: whatsappNumbers,
            });
            Alert.alert('Success', 'Profile updated successfully');
            setEditing(false);
            fetchProfile();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setDoctorName(profile?.doctor_name || '');
        setPhone(profile?.phone || '');
        setSpecialization(profile?.specialization || '');
        setChatId(profile?.chat_id ? String(profile.chat_id) : '');
        setEducation(profile?.education || '');
        setAddress(profile?.address || '');
        setRegistrationNo(profile?.registration_no || '');
        setGstNumber(profile?.gst_number || '');
        setPanNumber(profile?.pan_number || '');
        setTelegramUserid(profile?.telegram_userid || '');
        setProfilePicUrl(profile?.profile_pic_url || '');
        setDocumentUrl(profile?.document_url || '');
        setWhatsappNumbers(profile?.whatsapp_numbers || []);
        setEditing(false);
    };

    const handleProfilePhotoPick = async () => {
        try {
            setUploadingPhoto(true);
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Permission required', 'Please allow photo library access to upload a profile picture.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsEditing: true,
                aspect: [1, 1],
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const asset = result.assets[0];
            const uploaded = await uploadDoctorFile({
                uri: asset.uri,
                name: asset.fileName || `profile-${Date.now()}.jpg`,
                mimeType: asset.mimeType || 'image/jpeg',
                type: 'profile_pic',
            });

            setProfilePicUrl(uploaded.url);
            setProfile((prev) => (prev ? { ...prev, profile_pic_url: uploaded.url } : prev));
        } catch (error: any) {
            Alert.alert('Upload failed', error?.message || 'Unable to upload profile picture.');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleDocumentPick = async () => {
        try {
            setUploadingDocument(true);
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
                multiple: false,
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const asset = result.assets[0];
            const uploaded = await uploadDoctorFile({
                uri: asset.uri,
                name: asset.name || `document-${Date.now()}.pdf`,
                mimeType: asset.mimeType || 'application/pdf',
                type: 'document',
            });

            setDocumentUrl(uploaded.url);
            setProfile((prev) => (prev ? { ...prev, document_url: uploaded.url } : prev));
        } catch (error: any) {
            Alert.alert('Upload failed', error?.message || 'Unable to upload document.');
        } finally {
            setUploadingDocument(false);
        }
    };

    const openDocument = async () => {
        const url = documentUrl || profile?.document_url;
        if (!url) {
            Alert.alert('No document', 'No degree document is available for this profile yet.');
            return;
        }

        try {
            const canOpen = await Linking.canOpenURL(url);
            if (!canOpen) {
                Alert.alert('Unable to open', 'This document URL could not be opened on your device.');
                return;
            }
            await Linking.openURL(url);
        } catch (error) {
            Alert.alert('Unable to open', 'Something went wrong while opening the document.');
        }
    };

    const addWhatsApp = () => {
        const trimmed = newWaNumber.trim();
        if (!trimmed) {
            Alert.alert('Error', 'Please enter a WhatsApp number');
            return;
        }
        const isPrimary = whatsappNumbers.length === 0;
        setWhatsappNumbers([...whatsappNumbers, { whatsapp_number: trimmed, is_primary: isPrimary }]);
        setNewWaNumber('');
        setShowAddWa(false);
    };

    const removeWhatsApp = (idx: number) => {
        const updated = whatsappNumbers.filter((_, i) => i !== idx);
        // If primary was removed, set new first as primary
        if (whatsappNumbers[idx].is_primary && updated.length > 0) {
            updated[0].is_primary = true;
        }
        setWhatsappNumbers(updated);
    };

    const setPrimary = (idx: number) => {
        setWhatsappNumbers(whatsappNumbers.map((w, i) => ({ ...w, is_primary: i === idx })));
    };

    const handleAddLeave = async () => {
        // Build date from picker selection
        const y = years[pickerYear];
        const m = String(pickerMonth + 1).padStart(2, '0');
        const d = days[Math.min(pickerDay, days.length - 1)];
        const dateStr = `${y}-${m}-${d}`;
        setSavingLeave(true);
        try {
            const created = await addLeave(dateStr, leaveReason);
            setLeaves(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
            setShowAddLeave(false);
            setLeaveDate('');
            setLeaveReason('');
        } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.error || 'Failed to add leave');
        }
        setSavingLeave(false);
    };

    const handleDeleteLeave = (id: number, date: string) => {
        Alert.alert('Remove Leave', `Remove leave for ${date}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove', style: 'destructive', onPress: async () => {
                    try {
                        await deleteLeave(id);
                        setLeaves(prev => prev.filter(l => l.leave_id !== id));
                    } catch (e) { Alert.alert('Error', 'Failed to remove leave'); }
                }
            },
        ]);
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await removeToken();
                    clearSession();
                    navigation.reset({
                        index: 0,
                        routes: [{ name: 'Login' }],
                    });
                },
            },
        ]);
    };

    const handleManageStaff = React.useCallback(() => {
        navigation.navigate('StaffList');
    }, [navigation]);

    if (sessionLoading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading your profile...</Text>
            </View>
        );
    }

    if (isClinicStaff) {
        return (
            <SafeAreaView className="flex-1 bg-blue-700">
                <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
                <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>
                    <Animated.View
                        entering={FadeInDown.duration(600).springify()}
                        className="bg-blue-700 px-6 pt-8 pb-10"
                    >
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            className="self-start w-10 h-10 rounded-full bg-white/15 items-center justify-center mb-4"
                            activeOpacity={0.85}
                        >
                            <ChevronLeft size={20} color="#ffffff" />
                        </TouchableOpacity>
                        <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-1">
                                <Text className="text-blue-200 text-sm font-medium">Clinic Staff Profile</Text>
                                <Text className="text-white text-3xl font-bold mt-1">
                                    {name || 'Clinic Staff'}
                                </Text>
                                <View className="self-start mt-3 bg-white/15 border border-white/20 rounded-full px-3 py-1.5">
                                    <Text className="text-white text-xs font-bold">
                                        {staff_role ? String(staff_role).replace(/_/g, ' ') : 'Clinic Staff'}
                                    </Text>
                                </View>
                            </View>
                            <View className="bg-white w-16 h-16 rounded-full items-center justify-center border-4 border-blue-500"
                                style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                            >
                                <User size={32} color="#1d4ed8" />
                            </View>
                        </View>
                    </Animated.View>

                    <View className="px-5 mt-6">
                        <Animated.Text entering={FadeInUp.delay(220).duration(500)} className="text-gray-700 font-bold text-base mb-3">
                            Account Info
                        </Animated.Text>

                        <Animated.View entering={FadeInUp.delay(300).duration(500)}>
                            <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                <View className="mr-3 mt-0.5"><User size={20} color="#4b5563" /></View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Name</Text>
                                    <Text className="text-base text-gray-800 font-medium">{name || 'N/A'}</Text>
                                </View>
                            </View>
                            <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                <View className="mr-3 mt-0.5"><Phone size={20} color="#4b5563" /></View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Email</Text>
                                    <Text className="text-base text-gray-800 font-medium">{email || 'N/A'}</Text>
                                </View>
                            </View>
                            <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                <View className="mr-3 mt-0.5"><BadgeCheck size={20} color="#4b5563" /></View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Role</Text>
                                    <Text className="text-base text-gray-800 font-medium">Clinic Staff</Text>
                                </View>
                            </View>
                            <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                <View className="mr-3 mt-0.5"><Stethoscope size={20} color="#4b5563" /></View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Access Level</Text>
                                    <Text className="text-base text-gray-800 font-medium">
                                        {staff_role ? String(staff_role).replace(/_/g, ' ') : 'N/A'}
                                    </Text>
                                </View>
                            </View>
                            <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                <View className="mr-3 mt-0.5"><CalendarDays size={20} color="#4b5563" /></View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Assigned Clinic ID</Text>
                                    <Text className="text-base text-gray-800 font-medium">{staff_clinic_id ? String(staff_clinic_id) : 'All Clinics'}</Text>
                                </View>
                            </View>
                            <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                <View className="mr-3 mt-0.5"><MessageCircle size={20} color="#4b5563" /></View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Linked Doctor ID</Text>
                                    <Text className="text-base text-gray-800 font-medium">{staff_doctor_id ? String(staff_doctor_id) : 'N/A'}</Text>
                                </View>
                            </View>
                        </Animated.View>

                        <Animated.View entering={FadeInUp.delay(420).duration(500)} className="mt-4 mb-10">
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

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading your profile...</Text>
            </View>
        );
    }

    const currentProfilePic = profilePicUrl || profile?.profile_pic_url || '';
    const currentDocumentUrl = documentUrl || profile?.document_url || '';

    return (
        <SafeAreaView className="flex-1 bg-blue-700">
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>

                {/* Header */}
                <Animated.View
                    entering={FadeInDown.duration(600).springify()}
                    className="bg-blue-700 px-6 pt-8 pb-10"
                >
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        className="self-start mb-4 bg-white/15 rounded-full p-2"
                    >
                        <ChevronLeft size={20} color="#ffffff" />
                    </TouchableOpacity>
                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-1">
                            <Text className="text-blue-200 text-sm font-medium">Doctor Profile</Text>
                            <Text className="text-white text-3xl font-bold mt-1">
                                Dr. {profile?.doctor_name}
                            </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                            <View className="bg-white w-16 h-16 rounded-full items-center justify-center border-4 border-blue-500 overflow-hidden"
                                style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                            >
                                {currentProfilePic ? (
                                    <Image
                                        source={{ uri: currentProfilePic }}
                                        style={{ width: 56, height: 56, borderRadius: 999 }}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <User size={32} color="#1d4ed8" />
                                )}
                            </View>
                        </View>
                    </View>
                    <View className="flex-row gap-2 flex-wrap mt-1">
                        <View className="bg-white/15 px-3 py-2 rounded-2xl">
                            <Text className="text-blue-100 text-[11px] font-semibold uppercase">Status</Text>
                            <Text className="text-white text-sm font-bold mt-0.5">{profile?.status || 'N/A'}</Text>
                        </View>
                        <View className="bg-white/15 px-3 py-2 rounded-2xl">
                            <Text className="text-blue-100 text-[11px] font-semibold uppercase">Allowed Clinics</Text>
                            <Text className="text-white text-sm font-bold mt-0.5">{profile?.num_clinics ?? 0}</Text>
                        </View>
                    </View>
                    <View className="flex-row gap-2 mt-4">
                        {!editing ? (
                            <View className="flex-row flex-wrap gap-2">
                                <TouchableOpacity
                                    onPress={() => setEditing(true)}
                                    className="flex-row items-center bg-white/20 px-4 py-2 rounded-full"
                                >
                                    <Pencil size={14} color="#fff" />
                                    <Text className="text-white text-sm font-semibold ml-1">Edit Profile</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleManageStaff}
                                    className="flex-row items-center bg-white/20 px-4 py-2 rounded-full"
                                >
                                    <BadgeCheck size={14} color="#fff" />
                                    <Text className="text-white text-sm font-semibold ml-1">Manage Staff</Text>
                                </TouchableOpacity>
                            </View>
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
                    {editing && (
                        <TouchableOpacity
                            onPress={handleProfilePhotoPick}
                            disabled={uploadingPhoto}
                            className="self-start mt-3 flex-row items-center bg-white/20 px-4 py-2 rounded-full"
                        >
                            {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={14} color="#fff" />}
                            <Text className="text-white text-sm font-semibold ml-2">
                                {currentProfilePic ? 'Change Photo' : 'Upload Photo'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>

                <View className="px-5 mt-6">
                    {/* Profile Info */}
                    <Animated.Text entering={FadeInUp.delay(300).duration(500)} className="text-gray-700 font-bold text-base mb-3">Profile Info</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        {editing ? (
                            <View className="space-y-3 mb-3">
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Full Name</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={doctorName}
                                        onChangeText={setDoctorName}
                                        placeholder="Dr. Name"
                                    />
                                </View>
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
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Specialization</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={specialization}
                                        onChangeText={setSpecialization}
                                        placeholder="e.g. Cardiologist"
                                    />
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Telegram Chat ID</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={chatId}
                                        onChangeText={setChatId}
                                        placeholder="e.g. 123456789"
                                        keyboardType="number-pad"
                                    />
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Telegram User ID</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={telegramUserid}
                                        onChangeText={setTelegramUserid}
                                        placeholder="e.g. @doctor_smith"
                                    />
                                </View>
                            </View>
                        ) : (
                            <>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><Phone size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Phone</Text>
                                        <Text className="text-base text-gray-800 font-medium">{profile?.phone || 'N/A'}</Text>
                                    </View>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><Stethoscope size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Specialization</Text>
                                        <Text className="text-base text-gray-800 font-medium">{profile?.specialization || 'N/A'}</Text>
                                    </View>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start" style={{ elevation: 2 }}>
                                    <View className="mr-3 mt-0.5"><MessageCircle size={20} color="#4b5563" /></View>
                                    <View className="flex-1">
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Telegram Chat ID</Text>
                                        <Text className="text-base text-gray-800 font-medium">{profile?.chat_id ? String(profile.chat_id) : 'N/A'}</Text>
                                    </View>
                                </View>
                            </>
                        )}
                    </Animated.View>

                    {/* Professional info */}
                    <Animated.Text entering={FadeInUp.delay(450).duration(500)} className="text-gray-700 font-bold text-base mt-4 mb-3">Professional Info</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(500).duration(500)}>
                        {editing ? (
                            <View className="space-y-3 mb-3">
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Education / Qualification</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={education}
                                        onChangeText={setEducation}
                                        placeholder="e.g. MBBS, MD"
                                    />
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Doctor Registration No.</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={registrationNo}
                                        onChangeText={setRegistrationNo}
                                        placeholder="Registration number"
                                    />
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">GST Number</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={gstNumber}
                                        onChangeText={setGstNumber}
                                        placeholder="GST number"
                                        autoCapitalize="characters"
                                    />
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">PAN Number</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={panNumber}
                                        onChangeText={setPanNumber}
                                        placeholder="PAN number"
                                        autoCapitalize="characters"
                                    />
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-3 border border-blue-100">
                                    <Text className="text-xs text-gray-400 font-semibold uppercase mb-1">Address</Text>
                                    <TextInput
                                        className="text-gray-800 text-base"
                                        value={address}
                                        onChangeText={setAddress}
                                        placeholder="Clinic / residence address"
                                        multiline
                                        textAlignVertical="top"
                                        style={{ minHeight: 84 }}
                                    />
                                </View>
                            </View>
                        ) : (
                            <>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3" style={{ elevation: 2 }}>
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Education / Qualification</Text>
                                    <Text className="text-base text-gray-800 font-medium">{profile?.education || 'N/A'}</Text>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3" style={{ elevation: 2 }}>
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Doctor Registration No.</Text>
                                    <Text className="text-base text-gray-800 font-medium">{profile?.registration_no || 'N/A'}</Text>
                                </View>
                                <View className="flex-row gap-3 mb-3">
                                    <View className="bg-white rounded-2xl px-4 py-4 flex-1" style={{ elevation: 2 }}>
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">GST Number</Text>
                                        <Text className="text-base text-gray-800 font-medium">{profile?.gst_number || 'N/A'}</Text>
                                    </View>
                                    <View className="bg-white rounded-2xl px-4 py-4 flex-1" style={{ elevation: 2 }}>
                                        <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">PAN Number</Text>
                                        <Text className="text-base text-gray-800 font-medium">{profile?.pan_number || 'N/A'}</Text>
                                    </View>
                                </View>
                                <View className="bg-white rounded-2xl px-4 py-4 mb-3" style={{ elevation: 2 }}>
                                    <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Address</Text>
                                    <Text className="text-base text-gray-800 font-medium">{profile?.address || 'N/A'}</Text>
                                </View>
                            </>
                        )}
                    </Animated.View>

                    {/* Documents */}
                    <Animated.Text entering={FadeInUp.delay(540).duration(500)} className="text-gray-700 font-bold text-base mt-4 mb-3">Documents</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(580).duration(500)}>
                        <View className="bg-white rounded-2xl px-4 py-4 mb-3" style={{ elevation: 2 }}>
                            <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Degree / Education Document</Text>
                            <Text className="text-sm text-gray-600 mb-3">
                                {currentDocumentUrl ? 'A document is uploaded for this profile.' : 'No document uploaded yet.'}
                            </Text>
                            <View className="flex-row gap-2">
                                <TouchableOpacity
                                    onPress={openDocument}
                                    className={`px-4 py-2 rounded-xl ${currentDocumentUrl ? 'bg-blue-600' : 'bg-gray-200'}`}
                                    disabled={!currentDocumentUrl}
                                >
                                    <Text className={`font-semibold ${currentDocumentUrl ? 'text-white' : 'text-gray-500'}`}>Open Document</Text>
                                </TouchableOpacity>
                                {editing && (
                                    <TouchableOpacity
                                        onPress={handleDocumentPick}
                                        disabled={uploadingDocument}
                                        className="px-4 py-2 rounded-xl bg-amber-50 flex-row items-center"
                                    >
                                        {uploadingDocument ? <ActivityIndicator size="small" color="#b45309" /> : <Upload size={14} color="#b45309" />}
                                        <Text className="text-amber-700 font-medium text-xs ml-2">
                                            {currentDocumentUrl ? 'Replace' : 'Upload'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </Animated.View>

                    {/* WhatsApp Numbers */}
                    <View className="flex-row justify-between items-center mt-4 mb-3">
                        <Animated.Text entering={FadeInUp.delay(500).duration(500)} className="text-gray-700 font-bold text-base">💬 WhatsApp Numbers</Animated.Text>
                        {editing && (
                            <TouchableOpacity onPress={() => setShowAddWa(true)} className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-full">
                                <Plus size={14} color="#2563eb" />
                                <Text className="text-blue-600 text-xs font-semibold ml-1">Add</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Animated.View entering={FadeInUp.delay(600).duration(500)}>
                        {(editing ? whatsappNumbers : (profile?.whatsapp_numbers || [])).length > 0 ? (
                            (editing ? whatsappNumbers : (profile?.whatsapp_numbers || [])).map((w: WhatsAppNumber, idx: number) => (
                                <View key={idx} className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-center" style={{ elevation: 2 }}>
                                    <View className="bg-green-100 w-10 h-10 rounded-full items-center justify-center mr-3">
                                        <MessageCircle size={18} color="#15803d" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-gray-800 font-semibold text-base">{w.whatsapp_number}</Text>
                                        {w.is_primary && (
                                            <View className="bg-green-100 self-start px-2 py-0.5 rounded-full mt-1">
                                                <Text className="text-green-700 text-xs font-bold">Primary</Text>
                                            </View>
                                        )}
                                    </View>
                                    {editing && (
                                        <View className="flex-row items-center gap-2">
                                            {!w.is_primary && (
                                                <TouchableOpacity onPress={() => setPrimary(idx)} className="bg-blue-50 px-2 py-1 rounded-lg">
                                                    <Text className="text-blue-600 text-xs font-semibold">Set Primary</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity onPress={() => removeWhatsApp(idx)}>
                                                <Trash2 size={18} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            ))
                        ) : (
                            <View className="bg-white rounded-2xl p-5 items-center mb-3">
                                <PhoneOff size={32} color="#9ca3af" />
                                <Text className="text-gray-400 italic mt-2 text-sm">No WhatsApp numbers added</Text>
                            </View>
                        )}
                    </Animated.View>

                    {/* Leaves section */}
                    <View className="flex-row justify-between items-center mt-4 mb-3">
                        <Animated.Text entering={FadeInUp.delay(650).duration(500)} className="text-gray-700 font-bold text-base">🏖️ Leave Days</Animated.Text>
                        <TouchableOpacity onPress={() => setShowAddLeave(true)} className="flex-row items-center bg-red-50 px-3 py-1.5 rounded-full">
                            <Plus size={14} color="#ef4444" />
                            <Text className="text-red-500 text-xs font-semibold ml-1">Add Leave</Text>
                        </TouchableOpacity>
                    </View>
                    <Animated.View entering={FadeInUp.delay(700).duration(500)}>
                        {leaves.length > 0 ? leaves.map(l => (
                            <View key={l.leave_id} className="bg-white rounded-2xl px-4 py-3 mb-2 flex-row items-center" style={{ borderWidth: 1, borderColor: '#fecaca', elevation: 2 }}>
                                <View className="bg-red-100 w-9 h-9 rounded-full items-center justify-center mr-3">
                                    <BedDouble size={16} color="#ef4444" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-gray-800 font-semibold text-sm">{l.date}</Text>
                                    {l.reason ? <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>{l.reason}</Text> : null}
                                </View>
                                <TouchableOpacity onPress={() => handleDeleteLeave(l.leave_id, l.date)}>
                                    <Trash2 size={18} color="#ef4444" />
                                </TouchableOpacity>
                            </View>
                        )) : (
                            <View className="bg-white rounded-2xl p-5 items-center mb-3" style={{ borderWidth: 1, borderColor: '#f3f4f6' }}>
                                <CalendarDays size={30} color="#d1d5db" />
                                <Text className="text-gray-400 italic mt-2 text-sm">No leaves added</Text>
                            </View>
                        )}
                    </Animated.View>

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

            {/* Add WhatsApp Number Modal */}
            <Modal visible={showAddWa} transparent animationType="slide" onRequestClose={() => setShowAddWa(false)}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <Text className="text-xl font-bold text-gray-800 mb-4">Add WhatsApp Number</Text>
                        <View className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-4">
                            <TextInput
                                placeholder="+91 9876543210"
                                value={newWaNumber}
                                onChangeText={setNewWaNumber}
                                keyboardType="phone-pad"
                                className="text-gray-800 text-base"
                                autoFocus
                            />
                        </View>
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={addWhatsApp} className="flex-1 bg-blue-600 rounded-xl py-3 items-center">
                                <Text className="text-white font-bold">Add</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setShowAddWa(false); setNewWaNumber(''); }} className="flex-1 bg-gray-100 rounded-xl py-3 items-center">
                                <Text className="text-gray-700 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Add Leave Modal */}
            <Modal visible={showAddLeave} transparent animationType="slide" onRequestClose={() => setShowAddLeave(false)}>
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1e3a8a', marginBottom: 16 }}>Add Leave Day</Text>

                        {/* 3-column date picker */}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>Select Date</Text>
                        <View style={{ flexDirection: 'row', gap: 8, borderRadius: 16, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e0e7ff', padding: 8, marginBottom: 16 }}>
                            <WheelColumn
                                items={years}
                                selectedIndex={pickerYear}
                                onSelect={setPickerYear}
                            />
                            <WheelColumn
                                items={months}
                                selectedIndex={pickerMonth}
                                onSelect={setPickerMonth}
                            />
                            <WheelColumn
                                items={days}
                                selectedIndex={Math.min(pickerDay, days.length - 1)}
                                onSelect={setPickerDay}
                            />
                        </View>

                        {/* Selected date preview */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 }}>
                            <CalendarDays size={16} color="#2563eb" style={{ marginRight: 8 }} />
                            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 14 }}>
                                {`${years[pickerYear]}-${String(pickerMonth + 1).padStart(2, '0')}-${days[Math.min(pickerDay, days.length - 1)]}`}
                            </Text>
                        </View>

                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>Reason (optional)</Text>
                        <View style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20 }}>
                            <TextInput
                                placeholder="e.g. Personal leave, Conference…"
                                placeholderTextColor="#9ca3af"
                                value={leaveReason}
                                onChangeText={setLeaveReason}
                                style={{ color: '#1f2937', fontSize: 15 }}
                            />
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                onPress={handleAddLeave}
                                disabled={savingLeave}
                                style={{ flex: 1, backgroundColor: '#ef4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: savingLeave ? 0.6 : 1 }}
                            >
                                {savingLeave
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add Leave</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setShowAddLeave(false); setLeaveReason(''); }}
                                style={{ flex: 1, backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                            >
                                <Text style={{ color: '#6b7280', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default ProfileScreen;
