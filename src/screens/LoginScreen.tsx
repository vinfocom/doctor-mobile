import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { login, patientLogin, saveDoctorPushToken, savePatientPushToken } from '../api/auth';
import { setAuthSession, type AppRole } from '../api/token';
import { useAuthSession } from '../context/AuthSessionContext';
import { registerForPushNotificationsAsync } from '../hooks/usePushNotifications';
import { Stethoscope, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { API_URL } from '../config/env';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;
const pushDebug = (...args: unknown[]) => {
    if (__DEV__) {
        console.log(...args);
    }
};

async function registerPushTokenForRole(role: 'DOCTOR' | 'PATIENT', authToken?: string) {
    try {
        const pushToken = await registerForPushNotificationsAsync();
        if (!pushToken?.data) {
            pushDebug(`[push] ${role.toLowerCase()} login flow: no push token generated`);
            return;
        }

        pushDebug(`[push] ${role.toLowerCase()} login flow: saving push token`);
        if (role === 'PATIENT') {
            await savePatientPushToken(pushToken.data, authToken);
        } else {
            await saveDoctorPushToken(pushToken.data, authToken);
        }
        pushDebug(`[push] ${role.toLowerCase()} login flow: push token saved successfully`);
    } catch (error) {
        pushDebug(`[push] ${role.toLowerCase()} login flow: failed to register/save push token`, error);
    }
}

const LoginScreen = () => {
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const { refreshSession } = useAuthSession();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'DOCTOR' | 'PATIENT'>('DOCTOR');
    const [patientIdentifier, setPatientIdentifier] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        // Alert.alert('API Check', `Using API URL:\n${API_URL}`);
        setLoading(true);
        try {
            if (mode === 'DOCTOR') {
                if (!email || !password) {
                    Alert.alert('Error', 'Please enter email and password');
                    return;
                }
                const response = await login(email, password);
                const userRole = response?.user?.role as AppRole | undefined;
                if (response.token && (userRole === 'DOCTOR' || userRole === 'CLINIC_STAFF')) {
                    await setAuthSession(response.token, userRole);
                    if (userRole === 'DOCTOR') {
                        await registerPushTokenForRole('DOCTOR', response.token);
                    }
                    await refreshSession();
                    navigation.replace('DoctorMain');
                } else {
                    Alert.alert('Error', 'Login failed: Invalid doctor or clinic staff session');
                }
            } else {
                if (!patientIdentifier.trim()) {
                    Alert.alert('Error', 'Please enter phone or telegram username');
                    return;
                }
                const response = await patientLogin(patientIdentifier.trim());
                if (response.token) {
                    await setAuthSession(response.token, 'PATIENT');
                    await registerPushTokenForRole('PATIENT', response.token);
                    await refreshSession();
                    navigation.replace('PatientMain');
                } else {
                    Alert.alert('Error', 'Login failed: No token received');
                }
            }
        } catch (error: any) {
            const status = error?.response?.status;
            let message = error?.response?.data?.error || 'Login failed. Please check your credentials and try again.';

            if (status === 401 || status === 400 || status === 404) {
                message = mode === 'DOCTOR'
                    ? 'Invalid email or password.'
                    : 'Invalid phone number or username.';
            } else if (status === 500) {
                message = 'Server error. Please try again later.';
            } else if (!status) {
                message = 'Network error. Please check your internet connection.';
                if (__DEV__) {
                    const code = error?.code ?? 'unknown';
                    const rawMessage = error?.message ?? 'unknown';
                    message += `\n\nAPI: ${API_URL}\nCode: ${code}\nRaw: ${rawMessage}`;
                }
            }

            Alert.alert('Login Failed', message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-blue-700" edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView
                    behavior="padding"
                    keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
                    className="flex-1"
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ── Header ── */}
                        <Animated.View
                            entering={FadeInDown.duration(600).springify()}
                            className="bg-blue-700 items-center px-8 pt-12 pb-16"
                        >
                            {/* Avatar */}
                            <View className="w-24 h-24 rounded-full bg-white items-center justify-center mb-5 shadow-lg">
                                <Stethoscope size={48} color="#1d4ed8" />
                            </View>

                            <Text className="text-white text-4xl font-extrabold tracking-wide mb-2">
                                {mode === 'DOCTOR' ? 'Doctor & Staff Portal' : 'Patient Portal'}
                            </Text>
                            <Text className="text-blue-200 text-base text-center">
                                {mode === 'DOCTOR' ? 'Sign in to manage appointments and clinic access' : 'Sign in to chat with your doctor'}
                            </Text>
                        </Animated.View>

                        {/* ── Form Card ── */}
                        <Animated.View
                            entering={FadeInUp.delay(200).duration(500)}
                            className="flex-1 bg-gray-50 px-7 pt-9 pb-10 -mt-7"
                            style={{ borderTopLeftRadius: 36, borderTopRightRadius: 36 }}
                        >
                            {/* Greeting */}
                            <View className="items-center mb-8">
                                <Text className="text-3xl font-extrabold text-slate-800 mb-2">
                                    Hi Doctor 👋
                                </Text>
                                <Text className="text-base text-slate-400 text-center">
                                    Please enter your credentials to continue
                                </Text>
                            </View>

                            <View className="bg-white border border-gray-200 rounded-2xl p-1 mb-5 flex-row">
                                <TouchableOpacity
                                    onPress={() => setMode('DOCTOR')}
                                    className={`flex-1 py-2 rounded-xl ${mode === 'DOCTOR' ? 'bg-blue-600' : 'bg-transparent'}`}
                                >
                                    <Text className={`text-center font-semibold ${mode === 'DOCTOR' ? 'text-white' : 'text-gray-600'}`}>Doctor</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setMode('PATIENT')}
                                    className={`flex-1 py-2 rounded-xl ${mode === 'PATIENT' ? 'bg-blue-600' : 'bg-transparent'}`}
                                >
                                    <Text className={`text-center font-semibold ${mode === 'PATIENT' ? 'text-white' : 'text-gray-600'}`}>Patient</Text>
                                </TouchableOpacity>
                            </View>

                            {mode === 'DOCTOR' ? (
                                <>
                                    {/* Email */}
                                    <View className="mb-5">
                                        <Text className="text-base font-bold text-gray-700 mb-2 ml-1">
                                            Email Address
                                        </Text>
                                        <View
                                            className={`flex-row items-center bg-white rounded-2xl px-4 border-2 ${emailFocused ? 'border-blue-500' : 'border-gray-200'
                                                }`}
                                            style={{
                                                shadowColor: emailFocused ? '#2563eb' : '#000',
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: emailFocused ? 0.15 : 0.04,
                                                shadowRadius: 6,
                                                elevation: emailFocused ? 4 : 1,
                                            }}
                                        >
                                            <Mail size={20} color="#64748b" />
                                            <TextInput
                                                className="flex-1 py-5 px-3 text-base text-slate-800"
                                                placeholder="doctor@example.com"
                                                placeholderTextColor="#9ca3af"
                                                value={email}
                                                onChangeText={setEmail}
                                                autoCapitalize="none"
                                                keyboardType="email-address"
                                                onFocus={() => setEmailFocused(true)}
                                                onBlur={() => setEmailFocused(false)}
                                            />
                                        </View>
                                    </View>

                                    {/* Password */}
                                    <View className="mb-3">
                                        <Text className="text-base font-bold text-gray-700 mb-2 ml-1">
                                            Password
                                        </Text>
                                        <View
                                            className={`flex-row items-center bg-white rounded-2xl px-4 border-2 ${passwordFocused ? 'border-blue-500' : 'border-gray-200'
                                                }`}
                                            style={{
                                                shadowColor: passwordFocused ? '#2563eb' : '#000',
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: passwordFocused ? 0.15 : 0.04,
                                                shadowRadius: 6,
                                                elevation: passwordFocused ? 4 : 1,
                                            }}
                                        >
                                            <Lock size={20} color="#64748b" />
                                            <TextInput
                                                className="flex-1 py-5 px-3 text-base text-slate-800"
                                                placeholder="Enter your password"
                                                placeholderTextColor="#9ca3af"
                                                value={password}
                                                onChangeText={setPassword}
                                                secureTextEntry={!showPassword}
                                                onFocus={() => setPasswordFocused(true)}
                                                onBlur={() => setPasswordFocused(false)}
                                            />
                                            <TouchableOpacity
                                                onPress={() => setShowPassword(!showPassword)}
                                                className="p-2"
                                            >
                                                {showPassword
                                                    ? <EyeOff size={22} color="#64748b" />
                                                    : <Eye size={22} color="#64748b" />
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <View className="mb-8">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">
                                        Phone or Telegram Username
                                    </Text>
                                    <View className="flex-row items-center bg-white rounded-2xl px-4 border-2 border-gray-200">
                                        <Mail size={20} color="#64748b" />
                                        <TextInput
                                            className="flex-1 py-5 px-3 text-base text-slate-800"
                                            placeholder="e.g. 9392569600 or username"
                                            placeholderTextColor="#9ca3af"
                                            value={patientIdentifier}
                                            onChangeText={setPatientIdentifier}
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>
                            )}

                            {/* Login Button */}
                            <TouchableOpacity
                                onPress={handleLogin}
                                disabled={loading}
                                activeOpacity={0.8}
                                className={`rounded-2xl py-5 items-center justify-center ${loading ? 'bg-blue-300' : 'bg-blue-600'
                                    }`}
                                style={{
                                    shadowColor: '#1d4ed8',
                                    shadowOffset: { width: 0, height: 6 },
                                    shadowOpacity: 0.4,
                                    shadowRadius: 12,
                                    elevation: 8,
                                }}
                            >
                                {loading ? (
                                    <View className="flex-row items-center">
                                        <ActivityIndicator color="#fff" size="small" />
                                        <Text className="text-white font-bold text-lg ml-3">
                                            Signing in...
                                        </Text>
                                    </View>
                                ) : (
                                    <View className="flex-row items-center">
                                        <Text className="text-white font-extrabold text-lg mr-2 tracking-wide">
                                            {mode === 'DOCTOR' ? 'Sign In as Doctor / Staff' : 'Sign In as Patient'}
                                        </Text>
                                        <ArrowRight size={20} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>

                            {/* Security Note */}
                            <View className="flex-row items-center justify-center mt-8 px-4">
                                <ShieldCheck size={14} color="#9ca3af" />
                                <Text className="text-xs text-gray-400 text-center ml-2">
                                    Authorized medical personnel only.{'\n'}Your session is encrypted and secure.
                                </Text>
                            </View>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
};

export default LoginScreen;
