import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    StatusBar,
} from 'react-native';
import {
    User,
    Phone,
    Info,
    Calendar,
    ChevronLeft
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getPatients } from '../api/patients';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type PatientDetailsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PatientDetails'>;

const InfoCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <View
        className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-start"
        style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
        }}
    >
        <View className="mr-3 mt-0.5">{icon}</View>
        <View className="flex-1">
            <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">{label}</Text>
            <Text className="text-base text-gray-800 font-medium">{value}</Text>
        </View>
    </View>
);

const PatientDetailsScreen = () => {
    const navigation = useNavigation<PatientDetailsNavigationProp>();
    const route = useRoute<any>();
    const { patientId } = route.params;

    const [patient, setPatient] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPatientDetails();
    }, []);

    const fetchPatientDetails = async () => {
        try {
            const data = await getPatients();
            const foundPatient = data.patients?.find((p: any) => p.patient_id === patientId);

            if (foundPatient) {
                setPatient(foundPatient);
            } else {
                Alert.alert('Error', 'Patient not found');
                navigation.goBack();
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to fetch patient details');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading patient details...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-blue-700">
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>

                {/* Header */}
                <Animated.View
                    entering={FadeInDown.duration(600).springify()}
                    className="bg-blue-700 px-6 pt-6 pb-10"
                    style={{ borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
                >
                    <View className="flex-row items-center mb-6">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-2 bg-blue-600 rounded-full">
                            <ChevronLeft size={24} color="#ffffff" />
                        </TouchableOpacity>
                        <Text className="text-white text-lg font-bold">Patient Data</Text>
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-1">
                            <Text className="text-blue-200 text-sm font-medium">Patient Details</Text>
                            <Text className="text-white text-3xl font-bold mt-1">
                                {patient?.full_name}
                            </Text>
                        </View>
                        {/* Avatar */}
                        <View className="bg-white w-20 h-20 rounded-full items-center justify-center border-4 border-blue-500"
                            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                        >
                            {/* Initials fallback logic */}
                            <Text className="text-3xl font-bold text-blue-700">
                                {patient?.full_name?.charAt(0)?.toUpperCase()}
                            </Text>
                        </View>
                    </View>

                    {/* Stats Row */}
                    <View className="flex-row mt-4 gap-3">
                        <View className="flex-1 bg-blue-600 rounded-2xl p-3 items-center">
                            <Text className="text-white text-xl font-bold">
                                {patient?.age ?? '—'}
                            </Text>
                            <Text className="text-blue-200 text-xs">Years Old</Text>
                        </View>
                        <View className="flex-1 bg-blue-600 rounded-2xl p-3 items-center">
                            <Text className="text-white text-xl font-bold capitalize">
                                {patient?.gender || '—'}
                            </Text>
                            <Text className="text-blue-200 text-xs">Gender</Text>
                        </View>
                    </View>
                </Animated.View>

                <View className="px-5 mt-6">
                    {/* Patient Info */}
                    <Animated.Text entering={FadeInUp.delay(300).duration(500)} className="text-gray-700 font-bold text-base mb-3">Health Information</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        <InfoCard icon={<Info size={20} color="#4b5563" />} label="Reason for Visit" value={patient?.reason || 'No reason specified'} />
                        <InfoCard icon={<Info size={20} color="#4b5563" />} label="Patient Type" value={patient?.patient_type || 'General'} />
                    </Animated.View>

                    {/* Contact Info */}
                    <Animated.Text entering={FadeInUp.delay(500).duration(500)} className="text-gray-700 font-bold text-base mt-4 mb-3">Contact Information</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(600).duration(500)} className="mb-10">
                        <InfoCard icon={<Phone size={20} color="#4b5563" />} label="Phone Number" value={patient?.phone || 'N/A'} />
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default PatientDetailsScreen;
