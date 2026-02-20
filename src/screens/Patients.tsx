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
    TextInput,
    Alert,
    RefreshControl
} from 'react-native';
import {
    User,
    Phone,
    Plus,
    X,
    Calendar,
    Stethoscope,
    Users
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPatients, createPatient } from '../api/patients';

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
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);

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

    useEffect(() => {
        fetchPatients();
    }, []);

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

    const filteredPatients = patients.filter(p =>
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone?.includes(searchQuery)
    );

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
                    className="bg-white rounded-2xl mb-4 overflow-hidden"
                    style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
                >
                    <View className="bg-emerald-600 px-4 py-3 flex-row items-center border-b border-emerald-500">
                        <View className="bg-white w-10 h-10 rounded-full items-center justify-center mr-3">
                            <User size={20} color="#059669" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-bold text-lg" numberOfLines={1}>
                                {item.full_name || 'Unknown Patient'}
                            </Text>
                            <Text className="text-emerald-100 text-xs mt-0.5">
                                {item.gender || 'N/A'} • {item.age ? `${item.age} yrs` : 'Age N/A'}
                            </Text>
                        </View>
                        <View className={`px-2 py-1 rounded-full ${isNew ? 'bg-emerald-200' : 'bg-emerald-800'}`}>
                            <Text className={`text-xs font-bold ${isNew ? 'text-emerald-800' : 'text-emerald-200'}`}>
                                {item.patient_type || 'STANDARD'}
                            </Text>
                        </View>
                    </View>

                    <View className="px-4 py-4 space-y-3">
                        <View className="flex-row items-center">
                            <View className="w-8 items-center"><Phone size={16} color="#6b7280" /></View>
                            <Text className="text-gray-600 font-medium">{item.phone || 'No phone number'}</Text>
                        </View>

                        {item.reason ? (
                            <View className="flex-row items-start">
                                <View className="w-8 items-center mt-1"><Stethoscope size={16} color="#6b7280" /></View>
                                <Text className="text-gray-600 flex-1 leading-5">{item.reason}</Text>
                            </View>
                        ) : null}

                        <View className="flex-row items-center">
                            <View className="w-8 items-center"><Calendar size={16} color="#6b7280" /></View>
                            <Text className="text-gray-400 text-xs">
                                Added {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
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
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[85%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-gray-800">Add Patient</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-gray-100 p-2 rounded-full">
                                <X size={24} color="#4b5563" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Full Name</Text>
                                    <TextInput
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                        placeholder="John Doe"
                                        value={formData.full_name}
                                        onChangeText={(t) => setFormData({ ...formData, full_name: t })}
                                    />
                                </View>

                                <View className="flex-row gap-4">
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
                                </View>

                                <View>
                                    <Text className="text-sm font-bold text-gray-700 mb-2">Phone Number</Text>
                                    <TextInput
                                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                        placeholder="Enter phone number"
                                        keyboardType="phone-pad"
                                        value={formData.phone}
                                        onChangeText={(t) => setFormData({ ...formData, phone: t })}
                                    />
                                </View>

                                <View>
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


                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default Patients;
