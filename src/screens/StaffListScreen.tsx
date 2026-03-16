import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    TextInput,
    ScrollView,
    RefreshControl,
    StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { deleteStaff, getStaff, type StaffMember } from '../api/staff';
import { useAuthSession } from '../context/AuthSessionContext';
import { ArrowLeft, Pencil, Plus, Search, Trash2, Users } from 'lucide-react-native';

type Nav = NativeStackNavigationProp<RootStackParamList, 'StaffList'>;

const formatValidity = (staff: StaffMember) => {
    if (!staff.valid_from && !staff.valid_to) return 'No limit';
    const from = staff.valid_from ? String(staff.valid_from).slice(0, 10) : 'Start';
    const to = staff.valid_to ? String(staff.valid_to).slice(0, 10) : 'End';
    return `${from} to ${to}`;
};

export default function StaffListScreen() {
    const navigation = useNavigation<Nav>();
    const { role } = useAuthSession();
    const [staff, setStaff] = React.useState<StaffMember[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [search, setSearch] = React.useState('');

    const loadStaff = React.useCallback(async () => {
        try {
            const response = await getStaff();
            setStaff(response.staff || []);
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to load clinic staff');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadStaff().catch(() => {
                // handled above
            });
        }, [loadStaff])
    );

    const handleDelete = React.useCallback((member: StaffMember) => {
        Alert.alert(
            'Delete user',
            `Delete ${member.name || member.email || 'this staff user'}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteStaff(member.staff_id);
                            setStaff((prev) => prev.filter((item) => item.staff_id !== member.staff_id));
                        } catch (error: any) {
                            Alert.alert('Error', error?.response?.data?.error || 'Failed to delete user');
                        }
                    },
                },
            ]
        );
    }, []);

    const filteredStaff = React.useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return staff;
        return staff.filter((member) => {
            const name = String(member.name || '').toLowerCase();
            const email = String(member.email || '').toLowerCase();
            const roleLabel = String(member.role || '').toLowerCase();
            const clinicName = String(member.clinic_name || '').toLowerCase();
            return name.includes(query) || email.includes(query) || roleLabel.includes(query) || clinicName.includes(query);
        });
    }, [search, staff]);

    if (role !== 'DOCTOR') {
        return (
            <SafeAreaView className="flex-1 bg-gray-50">
                <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
                <View className="flex-1 items-center justify-center px-6">
                    <Text className="text-lg font-bold text-gray-800">Doctor access only</Text>
                    <Text className="text-sm text-gray-500 text-center mt-2">Only doctors can manage clinic staff accounts.</Text>
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
                        <TouchableOpacity
                            onPress={() => navigation.navigate('StaffForm', { mode: 'create' })}
                            className="bg-white px-4 py-2.5 rounded-full flex-row items-center"
                        >
                            <Plus size={16} color="#1d4ed8" />
                            <Text className="text-blue-700 font-semibold ml-1.5">Add User</Text>
                        </TouchableOpacity>
                    </View>
                    <View className="mt-5">
                        <Text className="text-white text-3xl font-bold">Clinic Staff</Text>
                        <Text className="text-blue-100 text-sm mt-1">{filteredStaff.length} shown • {staff.length} total</Text>
                    </View>
                    <View className="mt-4 bg-white/95 rounded-2xl px-4 py-3 flex-row items-center">
                        <Search size={16} color="#6b7280" />
                        <TextInput
                            className="flex-1 ml-2 text-gray-800 text-sm"
                            placeholder="Search by name, email, role, clinic"
                            placeholderTextColor="#9ca3af"
                            value={search}
                            onChangeText={setSearch}
                        />
                    </View>
                </View>

                {loading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text className="text-gray-400 mt-3 text-sm">Loading clinic staff...</Text>
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1 px-4 pt-5"
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStaff(); }} />}
                    >
                        {filteredStaff.length === 0 ? (
                            <View className="bg-white rounded-2xl p-6 items-center border border-gray-100">
                                <Users size={30} color="#9ca3af" />
                                <Text className="text-gray-700 font-semibold mt-3">No clinic staff found</Text>
                                <Text className="text-gray-400 text-sm text-center mt-1">Create the first clinic staff account to manage delegated access.</Text>
                            </View>
                        ) : (
                            filteredStaff.map((member) => (
                                <View key={member.staff_id} className="bg-white rounded-2xl px-4 py-4 mb-3 border border-gray-100">
                                    <View className="flex-row items-start justify-between">
                                        <View className="flex-1 pr-3">
                                            <Text className="text-gray-900 font-bold text-base">{member.name || 'Unnamed user'}</Text>
                                            <Text className="text-gray-500 text-sm mt-0.5">{member.email || 'No email'}</Text>
                                        </View>
                                        <View className={`px-3 py-1 rounded-full ${member.status === 'ACTIVE' ? 'bg-green-100' : 'bg-red-100'}`}>
                                            <Text className={`text-xs font-bold ${member.status === 'ACTIVE' ? 'text-green-700' : 'text-red-600'}`}>
                                                {member.status || 'UNKNOWN'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View className="mt-4 flex-row" style={{ gap: 10 }}>
                                        <View className="flex-1 bg-blue-50 rounded-xl px-3 py-2">
                                            <Text className="text-[10px] uppercase tracking-wide text-blue-500 font-bold">Role</Text>
                                            <Text className="text-sm font-semibold text-blue-900 mt-1">
                                                {String(member.role || 'Unknown').replace(/_/g, ' ')}
                                            </Text>
                                        </View>
                                        <View className="flex-1 bg-emerald-50 rounded-xl px-3 py-2">
                                            <Text className="text-[10px] uppercase tracking-wide text-emerald-600 font-bold">Clinic</Text>
                                            <Text className="text-sm font-semibold text-emerald-900 mt-1">
                                                {member.clinic_name || 'All Clinics'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View className="mt-3 bg-gray-50 rounded-xl px-3 py-2">
                                        <Text className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Validity</Text>
                                        <Text className="text-sm font-semibold text-gray-800 mt-1">{formatValidity(member)}</Text>
                                    </View>

                                    <View className="mt-4 flex-row" style={{ gap: 10 }}>
                                        <TouchableOpacity
                                            onPress={() => navigation.navigate('StaffForm', {
                                                mode: 'edit',
                                                staff: {
                                                    staff_id: member.staff_id,
                                                    name: member.name,
                                                    email: member.email,
                                                    role: member.role,
                                                    status: member.status,
                                                    valid_from: member.valid_from,
                                                    valid_to: member.valid_to,
                                                    clinic_id: member.clinic_id,
                                                    clinic_name: member.clinic_name,
                                                    doctor_whatsapp_number: member.doctor_whatsapp_number,
                                                },
                                            })}
                                            className="flex-1 bg-blue-600 rounded-xl py-3 flex-row items-center justify-center"
                                        >
                                            <Pencil size={15} color="#fff" />
                                            <Text className="text-white font-semibold ml-2">Edit</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleDelete(member)}
                                            className="flex-1 bg-red-50 border border-red-200 rounded-xl py-3 flex-row items-center justify-center"
                                        >
                                            <Trash2 size={15} color="#ef4444" />
                                            <Text className="text-red-500 font-semibold ml-2">Delete</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        )}
                    </ScrollView>
                )}
            </View>
        </SafeAreaView>
    );
}
