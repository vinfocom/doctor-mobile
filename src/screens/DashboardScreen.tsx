import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    Alert,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    SafeAreaView,
    RefreshControl
} from 'react-native';
import {
    User,
    Phone,
    Stethoscope,
    FileText,
    MessageCircle,
    LogOut,
    PhoneOff,
    Award,
    Hash,
    Briefcase
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { getProfile } from '../api/auth';
import { removeToken } from '../api/token';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

type DashboardScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

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

const QuickActionButton = ({
    icon,
    label,
    onPress,
    color,
}: {
    icon: string;
    label: string;
    onPress: () => void;
    color: string;
}) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-1 items-center rounded-2xl py-4 mx-1"
        style={{
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 4,
        }}
    >
        <Text style={{ fontSize: 22 }} className="mb-1">{icon}</Text>
        <Text className="text-white font-bold text-xs text-center">{label}</Text>
    </TouchableOpacity>
);

const DashboardScreen = () => {
    const navigation = useNavigation<DashboardScreenNavigationProp>();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            await fetchProfile();
        } finally {
            setRefreshing(false);
        }
    }, [fetchProfile]);

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await removeToken();
                    navigation.replace('Login');
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
        <SafeAreaView className="flex-1 bg-blue-700 ">
            <StatusBar barStyle="light-content" backgroundColor="#3032ceff" />
            <ScrollView
                className="flex-1 bg-gray-50"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1d4ed8']} />
                }
            >

                {/* Header */}
                <Animated.View
                    entering={FadeInDown.duration(600).springify()}
                    className="bg-blue-700 px-6 pt-16 pb-16 "

                >
                    <View className=" items-center gap-6 justify-between mb-4">
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('Profile')}
                            className="bg-white w-20 h-20 rounded-full items-center justify-center"
                            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}
                        >
                            <User size={38} color="#1d4ed8" />
                        </TouchableOpacity>
                        <View>
                            <Text className="text-blue-100 text-lg font-medium">Hello,</Text>
                            <Text className="text-white text-4xl font-bold">
                                Dr. {profile?.doctor_name}
                            </Text>
                        </View>


                    </View>
                </Animated.View>

                <View className="px-5 mt-6">
                    {/* Quick Actions */}
                    <Animated.Text entering={FadeInUp.delay(200).duration(500)} className="text-gray-700 font-bold text-base mb-3">Quick Actions</Animated.Text>

                    {/* Profile Info */}
                    <Animated.Text entering={FadeInUp.delay(300).duration(500)} className="text-gray-700 font-bold text-base mb-3">Contact Info</Animated.Text>
                    <Animated.View entering={FadeInUp.delay(400).duration(500)}>
                        <InfoCard icon={<Phone size={20} color="#4b5563" />} label="Phone" value={profile?.phone || 'N/A'} />
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default DashboardScreen;