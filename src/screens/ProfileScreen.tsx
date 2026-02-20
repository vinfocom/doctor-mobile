import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    SafeAreaView
} from 'react-native';
import {
    User,
    Phone,
    Stethoscope,
    FileText,
    MessageCircle,
    LogOut,
    PhoneOff,
    Plus,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getProfile } from '../api/auth';
import { removeToken } from '../api/token';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

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

const ProfileScreen = () => {
    const navigation = useNavigation<ProfileScreenNavigationProp>();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const data = await getProfile();
            setProfile(data.doctor);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to fetch profile');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await removeToken();
                    // Reset navigation stack to Login
                    navigation.reset({
                        index: 0,
                        routes: [{ name: 'Login' }],
                    });
                },
            },
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
                <Text className="text-gray-400 mt-3 text-sm">Loading your profile...</Text>
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
                    className="bg-blue-700 px-6 pt-8 pb-10"
                    
                >
                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-1">
                            <Text className="text-blue-200 text-sm font-medium">Doctor Profile</Text>
                            <Text className="text-white text-3xl font-bold mt-1">
                                Dr. {profile?.doctor_name}
                            </Text>
                        </View>
                        {/* Avatar */}
                        <View className="bg-white w-20 h-20 rounded-full items-center justify-center border-4 border-blue-500"
                            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                        >
                            <User size={40} color="#1d4ed8" />
                        </View>
                    </View>

                    
                </Animated.View>

                <View className="px-5 mt-6">
                    {/* Profile Info */}
                    <Animated.Text entering={FadeInUp.delay(300).duration(500)} className="text-gray-700 font-bold text-base mb-3">Profile Info</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        <InfoCard icon={<Phone size={20} color="#4b5563" />} label="Phone" value={profile?.phone || 'N/A'} />
                        <InfoCard icon={<Stethoscope size={20} color="#4b5563" />} label="Specialization" value={profile?.specialization || 'N/A'} />
                    </Animated.View>

                    {/* WhatsApp Numbers */}
                    <Animated.Text entering={FadeInUp.delay(500).duration(500)} className="text-gray-700 font-bold text-base mt-4 mb-3">💬 WhatsApp Numbers</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(600).duration(500)}>
                        {profile?.whatsapp_numbers && profile.whatsapp_numbers.length > 0 ? (
                            profile.whatsapp_numbers.map((w: any) => (
                                <View key={w.id} className="bg-white rounded-2xl px-4 py-4 mb-3 flex-row items-center">
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
                                   <TouchableOpacity onPress={() => {alert("Add WhatsApp Number")}}>
                                    <Plus size={20} color="#4b5563" />
                                   </TouchableOpacity>
                                </View>
                            ))
                        ) : (
                            <View className="bg-white rounded-2xl p-5 items-center mb-3">
                                <PhoneOff size={32} color="#9ca3af" />
                                <Text className="text-gray-400 italic mt-2 text-sm">No WhatsApp numbers added</Text>
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
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ProfileScreen;
