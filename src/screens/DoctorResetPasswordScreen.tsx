import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import {
    getLoginChallenge,
    getProfile,
    login,
    resetUserPasswordWithOtp,
    saveDoctorPushToken,
    verifyLoginChallenge,
} from '../api/auth';
import { setAuthSession, type AppRole } from '../api/token';
import { useAuthSession } from '../context/AuthSessionContext';
import { registerForPushNotificationsAsync } from '../hooks/usePushNotifications';
import { doctorNeedsSetup } from '../lib/doctorOnboarding';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DoctorResetPassword'>;
type ResetRoute = RouteProp<RootStackParamList, 'DoctorResetPassword'>;

function getResetPasswordErrorMessage(error: any) {
    const status = error?.response?.status;
    const responseMessage = error?.response?.data?.error || '';

    if (/invalid or expired verification token/i.test(responseMessage) || status === 401) return 'Verification expired.';
    if (/at least 6 characters/i.test(responseMessage)) {
        return 'Password is too short.';
    }
    if (/confirm password must match/i.test(responseMessage)) return 'Passwords do not match.';
    if (status === 404) return 'Account not found.';
    if (!status) return 'Check your internet connection.';
    return responseMessage || 'Reset failed.';
}

function solveChallenge(question: string) {
    const match = String(question || '').match(/(\d+)\s*([+\-*])\s*(\d+)/);
    if (!match) {
        throw new Error('Unable to solve login challenge automatically.');
    }

    const left = Number(match[1]);
    const operator = match[2];
    const right = Number(match[3]);

    const answer =
        operator === '+'
            ? left + right
            : operator === '-'
                ? left - right
                : left * right;

    return String(answer);
}

async function registerDoctorPushToken(authToken?: string) {
    try {
        const pushToken = await registerForPushNotificationsAsync();
        if (!pushToken?.data) return;
        await saveDoctorPushToken(pushToken.data, authToken);
    } catch (error) {
        if (__DEV__) {
            console.warn('[push] doctor reset password flow failed to sync push token', error);
        }
    }
}

export default function DoctorResetPasswordScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<ResetRoute>();
    const insets = useSafeAreaInsets();
    const { refreshSession } = useAuthSession();

    const { email, verificationToken } = route.params;

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [newPasswordFocused, setNewPasswordFocused] = useState(false);
    const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const passwordsMatch = useMemo(
        () => Boolean(newPassword.trim() && confirmPassword.trim() && newPassword === confirmPassword),
        [confirmPassword, newPassword]
    );
    const passwordsMismatch = useMemo(
        () => Boolean(confirmPassword.trim() && newPassword !== confirmPassword),
        [confirmPassword, newPassword]
    );
    const canSubmit = useMemo(
        () => Boolean(verificationToken && newPassword.trim() && confirmPassword.trim()),
        [confirmPassword, newPassword, verificationToken]
    );

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const completeDoctorAuth = async (token: string, role: AppRole) => {
        await setAuthSession(token, role);
        if (role === 'DOCTOR') {
            await registerDoctorPushToken(token);
        }
        await refreshSession();

        if (role === 'DOCTOR') {
            try {
                const profile = await getProfile();
                navigation.replace(doctorNeedsSetup(profile) ? 'DoctorOnboarding' : 'DoctorMain');
            } catch {
                navigation.replace('DoctorMain');
            }
            return;
        }

        navigation.replace('DoctorMain');
    };

    const handleSubmitPassword = async () => {
        if (!newPassword.trim() || !confirmPassword.trim()) {
            Alert.alert('Error', 'Enter both passwords.');
            return;
        }

        if (newPassword.trim().length < 6) {
            Alert.alert('Error', 'Password is too short.');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            await resetUserPasswordWithOtp(email, newPassword.trim(), confirmPassword.trim(), verificationToken);

            const challenge = await getLoginChallenge();
            const challengeAnswer = solveChallenge(challenge.question);
            const challengeVerification = await verifyLoginChallenge(
                challenge.challengeId,
                challengeAnswer
            );

            const loginResponse = await login(
                email,
                newPassword.trim(),
                challenge.challengeId,
                challengeVerification.verificationToken
            );

            const userRole = loginResponse?.user?.role as AppRole | undefined;
            if (!loginResponse?.token || (userRole !== 'DOCTOR' && userRole !== 'CLINIC_STAFF')) {
                throw new Error('Invalid doctor or clinic staff session');
            }

            await completeDoctorAuth(loginResponse.token, userRole);
        } catch (error: any) {
            const backendMessage = error?.response?.data?.error || '';
            const message = /invalid doctor or clinic staff session/i.test(backendMessage) || /Invalid doctor or clinic staff session/i.test(String(error?.message || ''))
                ? 'Password was reset, but automatic login failed. Please log in with your new password.'
                : getResetPasswordErrorMessage(error);

            Alert.alert('Reset Password', message, [
                {
                    text: 'OK',
                    onPress: () => {
                        if (/automatic login failed/i.test(message)) {
                            navigation.popTo('Login');
                        }
                    },
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-slate-50">
            <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: Math.max(insets.bottom, 16) + (keyboardVisible ? 220 : 24),
                        paddingTop: 0,
                    }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View className="px-6 pt-4 pb-6">
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.85}
                            className="self-start rounded-full bg-white/90 px-4 py-2 shadow-sm"
                        >
                            <View className="flex-row items-center">
                                <ArrowLeft size={18} color="#0f172a" />
                                <Text className="ml-2 text-slate-900 font-semibold">Back</Text>
                            </View>
                        </TouchableOpacity>

                        <Animated.View entering={FadeInUp.delay(60)} className="mt-8 items-center">
                            <View className="h-20 w-20 items-center justify-center rounded-full bg-blue-100">
                                <Lock size={34} color="#2563eb" />
                            </View>
                            <Text className="mt-6 text-3xl font-extrabold text-slate-900">Create New Password</Text>
                            <Text className="mt-3 text-center text-base leading-6 text-slate-600">
                                Set a new password for {email}.
                            </Text>
                        </Animated.View>

                        <Animated.View
                            entering={FadeInDown.delay(120)}
                            className="mt-8 rounded-[28px] bg-white px-5 py-6 shadow-sm"
                        >
                            <View className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                                <View className="flex-row">
                                    <ShieldCheck size={20} color="#2563eb" />
                                    <Text className="ml-3 flex-1 text-sm leading-5 text-blue-900">
                                        After password reset, you will be logged in automatically.
                                    </Text>
                                </View>
                            </View>

                            <View className="mt-6">
                                <Text className="mb-3 text-sm font-semibold text-slate-700">New Password</Text>
                                <View
                                    className={`flex-row items-center rounded-2xl border px-4 py-1 ${newPasswordFocused ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                                >
                                    <Lock size={20} color={newPasswordFocused ? '#2563eb' : '#64748b'} />
                                    <TextInput
                                        className="flex-1 px-3 py-4 text-base text-slate-900"
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        secureTextEntry={!showNewPassword}
                                        placeholder="Enter new password"
                                        placeholderTextColor="#94a3b8"
                                        onFocus={() => setNewPasswordFocused(true)}
                                        onBlur={() => setNewPasswordFocused(false)}
                                        autoCapitalize="none"
                                        editable={!loading}
                                    />
                                    <TouchableOpacity onPress={() => setShowNewPassword((current) => !current)} activeOpacity={0.8}>
                                        {showNewPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View className="mt-5">
                                <Text className="mb-3 text-sm font-semibold text-slate-700">Re-enter Password</Text>
                                <View
                                    className={`flex-row items-center rounded-2xl border px-4 py-1 ${
                                        passwordsMatch
                                            ? 'border-emerald-400 bg-slate-50'
                                            : passwordsMismatch
                                                ? 'border-red-300 bg-slate-50'
                                                : confirmPasswordFocused
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-slate-200 bg-slate-50'
                                    }`}
                                >
                                    <Lock
                                        size={20}
                                        color={
                                            passwordsMatch
                                                ? '#059669'
                                                : passwordsMismatch
                                                    ? '#dc2626'
                                                    : confirmPasswordFocused
                                                        ? '#2563eb'
                                                        : '#64748b'
                                        }
                                    />
                                    <TextInput
                                        className="flex-1 px-3 py-4 text-base text-slate-900"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry={!showConfirmPassword}
                                        placeholder="Re-enter password"
                                        placeholderTextColor="#94a3b8"
                                        onFocus={() => setConfirmPasswordFocused(true)}
                                        onBlur={() => setConfirmPasswordFocused(false)}
                                        autoCapitalize="none"
                                        editable={!loading}
                                    />
                                    <TouchableOpacity onPress={() => setShowConfirmPassword((current) => !current)} activeOpacity={0.8}>
                                        {showConfirmPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={() => {
                                    void handleSubmitPassword();
                                }}
                                disabled={loading || !canSubmit}
                                activeOpacity={0.9}
                                className={`mt-8 rounded-2xl px-6 py-4 ${loading || !canSubmit ? 'bg-blue-300' : 'bg-blue-600'}`}
                            >
                                {loading ? (
                                    <View className="flex-row items-center justify-center">
                                        <ActivityIndicator color="#fff" />
                                        <Text className="ml-3 text-base font-bold text-white">Resetting password...</Text>
                                    </View>
                                ) : (
                                    <View className="flex-row items-center justify-center">
                                        <Text className="mr-3 text-base font-bold text-white">Reset Password</Text>
                                        <ArrowRight size={18} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
