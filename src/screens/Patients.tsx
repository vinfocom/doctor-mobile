import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    TextInput,
    Alert,
    RefreshControl,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import {
    User,
    Phone,
    Plus,
    X,
    Stethoscope,
    Users,
    MessageCircle
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPatients, createPatient } from '../api/patients';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import type { NavigationProp } from '@react-navigation/native';
import { getChatNotifications } from '../api/notifications';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';

const AnimatedListItem = ({ children, index }: { children: React.ReactNode, index: number }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 100, useNativeDriver: true })
        ]).start();
    }, []);

    return <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>{children}</Animated.View>;
};

const Patients = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [unreadPatientIds, setUnreadPatientIds] = useState<Set<number>>(new Set());
    const lastNotifCheckAtRef = useRef<string>(new Date(Date.now() - 2 * 60 * 1000).toISOString());
    const socketRef = useRef<Socket | null>(null);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchPatients();
        setRefreshing(false);
    };

    const [formData, setFormData] = useState({
        full_name: '',
        age: '',
        gender: 'MALE',
        phone: '',
        reason: '',
        patient_type: 'NEW'
    });

    // Poll for new notifications and mark which patients have unread messages
    const checkNotifications = useCallback(async () => {
        try {
            const result = await getChatNotifications(lastNotifCheckAtRef.current);
            lastNotifCheckAtRef.current = new Date().toISOString();
            if (result?.latestMessage?.patientId && !result.latestMessage.isAnnouncement) {
                setUnreadPatientIds((prev) => {
                    const next = new Set(prev);
                    next.add(result.latestMessage!.patientId);
                    return next;
                });
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        fetchPatients();
        checkNotifications();
        const interval = setInterval(checkNotifications, 9000);
        return () => clearInterval(interval);
    }, [checkNotifications]);

    // WebSocket: listen for incoming patient messages and mark unread
    useEffect(() => {
        if (!patients.length) return;
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;

        socket.on('receive_message', (msg: any) => {
            if (!msg || msg.sender !== 'PATIENT') return;
            const pid = Number(msg.patient_id);
            if (!pid) return;
            setUnreadPatientIds((prev) => {
                const next = new Set(prev);
                next.add(pid);
                return next;
            });
        });

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [patients]);

    const fetchPatients = async () => {
        setLoading(true);
        try {
            const data = await getPatients();
            setPatients(data.patients || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePatient = async () => {
        if (!formData.full_name || !formData.phone || !formData.age) {
            Alert.alert("Error", "Please fill name, phone, and age fields");
            return;
        }

        setSubmitting(true);
        try {
            await createPatient(formData);
            Alert.alert("Success", "Patient added successfully");
            setModalVisible(false);
            setFormData({
                full_name: '',
                age: '',
                gender: 'MALE',
                phone: '',
                reason: '',
                patient_type: 'NEW'
            });
            fetchPatients();
        } catch (e) {
            Alert.alert("Error", "Failed to add patient");
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const filteredPatients = patients
        .filter(p =>
            p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.phone?.includes(searchQuery)
        )
        .sort((a, b) => {
            const aUnread = unreadPatientIds.has(Number(a.patient_id)) ? 0 : 1;
            const bUnread = unreadPatientIds.has(Number(b.patient_id)) ? 0 : 1;
            return aUnread - bUnread;
        });

    const handleOpenChat = (item: any) => {
        const patientId = Number(item?.patient_id);
        const doctorId = Number(item?.doctor_id);

        if (!patientId || !doctorId) {
            Alert.alert('Chat unavailable', 'This patient is not linked to a doctor yet.');
            return;
        }

        // Clear the unread badge for this patient when opening chat
        setUnreadPatientIds((prev) => {
            const next = new Set(prev);
            next.delete(patientId);
            return next;
        });

        navigation.navigate('Chat', {
            patientId,
            doctorId,
            patientName: item?.full_name || 'Unknown Patient',
            viewer: 'DOCTOR',
        });
    };


    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#059669" />
                <Text className="text-gray-400 mt-3 text-sm">Loading patients...</Text>
            </View>
        );
    }

    const renderItem = ({ item, index }: { item: any; index: number }) => {
        const isNew = item.patient_type === 'NEW';

        return (
            <AnimatedListItem index={index}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleOpenChat(item)}
                    className="bg-white rounded-2xl mb-4 overflow-hidden"
                    style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
                >
                    <View className="bg-emerald-900/90 px-3 py-2 border-b border-emerald-500">
                        <View className="flex-row items-center">
                            <View className="bg-white w-8 h-8 rounded-full items-center justify-center mr-2.5 relative">
                                <User size={16} color="#043f2cff" />
                                {unreadPatientIds.has(Number(item.patient_id)) && (
                                    <View className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 items-center justify-center border border-white">
                                        <Text className="text-white text-[8px] font-bold">!</Text>
                                    </View>
                                )}
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-bold text-sm" numberOfLines={1}>
                                    {item.full_name || 'Unknown Patient'}
                                </Text>
                                <Text className="text-emerald-100 text-[11px] mt-0.5">
                                    {item.gender || 'N/A'} • {item.age ? `${item.age} yrs` : 'Age N/A'}
                                </Text>
                            </View>
                            <View className={`px-2 py-0.5 rounded-lg ${isNew ? 'bg-emerald-200' : 'bg-emerald-800'}`}>
                                <Text className={`text-[10px] font-bold ${isNew ? 'text-emerald-800' : 'text-emerald-200'}`}>
                                    {item.patient_type || 'STANDARD'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View className="px-3 py-2.5">
                        <View className="flex-row items-center mb-1.5">
                            <View className="w-6 items-center"><Phone size={13} color="#6b7280" /></View>
                            <Text className="text-gray-600 text-xs font-medium ml-1">{item.phone || 'No phone number'}</Text>
                        </View>

                        {item.reason ? (
                            <View className="flex-row items-start mb-1.5">
                                <View className="w-6 items-center mt-0.5"><Stethoscope size={13} color="#6b7280" /></View>
                                <Text className="text-gray-500 text-xs flex-1 ml-1" numberOfLines={2}>{item.reason}</Text>
                            </View>
                        ) : null}

                        <View className="flex-row mt-1">
                            <TouchableOpacity
                                onPress={() => handleOpenChat(item)}
                                className="flex-1 rounded-lg bg-emerald-600 px-2 py-2 flex-row items-center justify-center mr-1"
                            >
                                <MessageCircle size={14} color="#ffffff" />
                                <Text className="text-white font-semibold text-xs ml-1.5">Chat</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('PatientDetails', { patientId: item.patient_id })}
                                className="flex-1 rounded-lg bg-white border border-emerald-300 px-2 py-2 items-center justify-center ml-1"
                            >
                                <Text className="text-emerald-700 font-semibold text-xs">Details</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </AnimatedListItem>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#047857' }} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#047857" />
            <View className="flex-1 bg-gray-50">
                <View className="bg-emerald-700 px-5 pt-6 pb-6" style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
                    <View className="flex-row justify-between items-center mb-5">
                        <View>
                            <Text className="text-white text-2xl font-bold">Patients Directory</Text>
                            <Text className="text-emerald-200 text-sm mt-1">
                                {patients.length} total patient{patients.length !== 1 ? 's' : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            className="bg-white p-3 rounded-full"
                            style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}
                        >
                            <Plus size={22} color="#047857" />
                        </TouchableOpacity>

                    </View>

                    <View className="bg-emerald-600 rounded-xl px-4 py-3 flex-row items-center">
                        <User size={18} color="#a7f3d0" />
                        <TextInput
                            placeholder="Search patients by name or phone..."
                            placeholderTextColor="#a7f3d0"
                            className="flex-1 text-white ml-3 font-medium"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <X size={18} color="#a7f3d0" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <FlatList
                    data={filteredPatients}
                    keyExtractor={(item) => item.patient_id?.toString() || Math.random().toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} tintColor="#059669" />
                    }
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Users size={48} color="#9ca3af" />
                            <Text className="text-gray-500 font-semibold text-base mt-4">
                                {searchQuery ? 'No patients match your search' : 'No patients found'}
                            </Text>
                            <Text className="text-gray-400 text-sm mt-1 text-center px-6">
                                {searchQuery ? 'Try a different name or phone number' : 'Tap the + button to add your first patient'}
                            </Text>
                        </View>
                    }
                />
            </View>

            {/* Add Patient Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-6 h-[85%]">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-2xl font-bold text-gray-800">Add Patient</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-gray-100 p-2 rounded-full">
                                    <X size={24} color="#4b5563" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View>
                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Full Name</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="John Doe"
                                            value={formData.full_name}
                                            onChangeText={(t) => setFormData({ ...formData, full_name: t })}
                                        />
                                    </View>

                                    <View className="flex-row mb-4">
                                        <View className="flex-1">
                                            <Text className="text-sm font-bold text-gray-700 mb-2">Age</Text>
                                            <TextInput
                                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                                placeholder="30"
                                                keyboardType="numeric"
                                                value={formData.age}
                                                onChangeText={(t) => setFormData({ ...formData, age: t })}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-sm font-bold text-gray-700 mb-2">Gender</Text>
                                            <View className="flex-row rounded-xl border border-gray-200 overflow-hidden">
                                                {['MALE', 'FEMALE'].map((g) => (
                                                    <TouchableOpacity
                                                        key={g}
                                                        onPress={() => setFormData({ ...formData, gender: g })}
                                                        className={`flex-1 py-3.5 items-center ${formData.gender === g ? 'bg-emerald-100' : 'bg-gray-50'}`}
                                                    >
                                                        <Text className={`font-semibold text-xs ${formData.gender === g ? 'text-emerald-700' : 'text-gray-500'}`}>
                                                            {g.charAt(0)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                        <View className="w-4" />
                                    </View>

                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Phone Number</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="Enter phone number"
                                            keyboardType="phone-pad"
                                            value={formData.phone}
                                            onChangeText={(t) => setFormData({ ...formData, phone: t })}
                                        />
                                    </View>

                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Reason (Optional)</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base h-24"
                                            placeholder="Brief description of symptoms/reason for visit"
                                            multiline
                                            textAlignVertical="top"
                                            value={formData.reason}
                                            onChangeText={(t) => setFormData({ ...formData, reason: t })}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        onPress={handleCreatePatient}
                                        disabled={submitting}
                                        className={`bg-emerald-600 rounded-2xl py-4 items-center mt-2 ${submitting ? 'opacity-70' : ''}`}
                                        style={{ shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text className="text-white font-bold text-lg">Add Patient</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

export default Patients;
