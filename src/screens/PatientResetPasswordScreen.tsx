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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { resetPasswordWithOtp, savePatientPushToken, setPasswordWithOtp } from '../api/auth';
import { setAuthSession } from '../api/token';
import { useAuthSession } from '../context/AuthSessionContext';
import { registerForPushNotificationsAsync } from '../hooks/usePushNotifications';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PatientResetPassword'>;
type ResetRoute = RouteProp<RootStackParamList, 'PatientResetPassword'>;

async function registerPatientPushToken(authToken?: string) {
    try {
        const pushToken = await registerForPushNotificationsAsync();
        if (!pushToken?.data) return;
        await savePatientPushToken(pushToken.data, authToken);
    } catch (error) {
        if (__DEV__) {
            console.warn('[push] patient reset password flow failed to sync push token', error);
        }
    }
}

function getProtectedPasswordErrorMessage(
    error: any,
    purpose: 'SET_PASSWORD_FIRST_TIME' | 'RESET_PASSWORD'
) {
    const status = error?.response?.status;
    const responseMessage = error?.response?.data?.error || '';
    const isForgotPasswordMode = purpose === 'RESET_PASSWORD';

    if (status === 404) return 'Patient not found. Please create an account.';
    if (/invalid or expired verification token/i.test(responseMessage) || status === 401) {
        return 'Your OTP verification expired. Please request a new OTP.';
    }
    if (/already set/i.test(responseMessage)) {
        return 'Password already set. Please log in or use forgot password.';
    }
    if (/does not have a password yet|use set password/i.test(responseMessage)) {
        return isForgotPasswordMode
            ? 'This account does not have a password yet. Please use the set password flow.'
            : responseMessage;
    }
    if (/at least 6 characters/i.test(responseMessage)) {
        return 'Password is too weak. It must be at least 6 characters.';
    }
    if (/confirm password must match/i.test(responseMessage)) {
        return 'Password and confirm password must match.';
    }
    if (!status) return 'Network error. Please check your internet connection.';
    return responseMessage || 'Unable to reset password right now.';
}

function maskPhone(phone: string) {
    const cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.length <= 4) return cleaned;
    return `${cleaned.slice(0, 2)}${'*'.repeat(Math.max(0, cleaned.length - 4))}${cleaned.slice(-2)}`;
}

export default function PatientResetPasswordScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<ResetRoute>();
    const insets = useSafeAreaInsets();
    const { refreshSession } = useAuthSession();

    const { phone, verificationToken, purpose } = route.params;
    const isForgotPasswordMode = purpose === 'RESET_PASSWORD';

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

    const completeProtectedAuth = async (token: string) => {
        await setAuthSession(token, 'PATIENT');
        await registerPatientPushToken(token);
        await refreshSession();
        navigation.replace('PatientMain');
    };

    const handleSubmitPassword = async () => {
        if (!newPassword.trim() || !confirmPassword.trim()) {
            Alert.alert('Error', 'Please enter and confirm your password');
            return;
        }

        if (newPassword.trim().length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'Password and confirm password must match');
            return;
        }

        setLoading(true);
        try {
            const response = isForgotPasswordMode
                ? await resetPasswordWithOtp(
                    phone,
                    newPassword.trim(),
                    confirmPassword.trim(),
                    verificationToken
                )
                : await setPasswordWithOtp(
                    phone,
                    newPassword.trim(),
                    confirmPassword.trim(),
                    verificationToken
                );

            if (!response?.token) {
                Alert.alert('Error', 'Password update failed: Invalid patient session');
                return;
            }

            await completeProtectedAuth(response.token);
        } catch (error: any) {
            Alert.alert(
                isForgotPasswordMode ? 'Reset Failed' : 'Set Password Failed',
                getProtectedPasswordErrorMessage(error, purpose)
            );
        } finally {
            setLoading(false);
        }
    };

    const authScrollBottomInset = keyboardVisible
        ? Math.max(insets.bottom + 220, 280)
        : Math.max(insets.bottom + 20, 28);

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: authScrollBottomInset }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    showsVerticalScrollIndicator={false}
                    className="bg-slate-50"
                    scrollIndicatorInsets={{ bottom: authScrollBottomInset }}
                >
                    <SafeAreaView edges={['top']} className="bg-blue-700">
                        <Animated.View entering={FadeInDown.duration(500)} className="px-6 pt-5 pb-9">
                            <TouchableOpacity
                                onPress={() => navigation.goBack()}
                                activeOpacity={0.85}
                                className="w-11 h-11 rounded-2xl bg-white/15 items-center justify-center mb-6"
                            >
                                <ArrowLeft size={20} color="#fff" />
                            </TouchableOpacity>

                            <View className="w-16 h-16 rounded-[22px] bg-white items-center justify-center mb-4">
                                <ShieldCheck size={30} color="#1d4ed8" />
                            </View>

                            <Text className="text-white text-[30px] font-extrabold mb-2">
                                {isForgotPasswordMode ? 'Create New Password' : 'Create Password'}
                            </Text>
                            <Text className="text-blue-100 text-sm leading-6">
                                {isForgotPasswordMode
                                    ? 'Your phone is verified. Set a new password to finish recovering access.'
                                    : 'Your phone is verified. Create a password to finish setting up your account.'}
                            </Text>
                        </Animated.View>
                    </SafeAreaView>

                    <Animated.View
                        entering={FadeInUp.delay(120).duration(450)}
                        className="px-6 pt-6 pb-6 -mt-6"
                        style={{ borderTopLeftRadius: 34, borderTopRightRadius: 34, backgroundColor: '#f8fafc' }}
                    >
                        <View className="bg-white rounded-[28px] border border-slate-200 px-5 py-5 mb-5">
                            <Text className="text-slate-800 text-base font-bold">
                                {isForgotPasswordMode ? 'Resetting password for' : 'Setting password for'}
                            </Text>
                            <Text className="text-slate-500 text-sm mt-1">{maskPhone(phone)}</Text>
                        </View>

                        <View className="bg-white rounded-[28px] border border-slate-200 px-5 py-5">
                            <Text className="text-slate-800 text-lg font-bold mb-2">
                                {isForgotPasswordMode ? 'Create new password' : 'Create password'}
                            </Text>
                            <Text className="text-slate-500 text-sm mb-4">
                                {isForgotPasswordMode
                                    ? 'Choose a strong password to finish resetting access.'
                                    : 'Choose a strong password to secure your account.'}
                            </Text>

                            <View className="mb-4">
                                <Text className="text-base font-bold text-gray-700 mb-2 ml-1">
                                    {isForgotPasswordMode ? 'New Password' : 'Set Password'}
                                </Text>
                                <View
                                    className={`flex-row items-center bg-white rounded-2xl px-4 border-2 ${
                                        newPasswordFocused ? 'border-blue-500' : 'border-gray-200'
                                    }`}
                                    style={{
                                        shadowColor: newPasswordFocused ? '#2563eb' : '#000',
                                        shadowOffset: { width: 0, height: 2 },
                                        shadowOpacity: newPasswordFocused ? 0.15 : 0.04,
                                        shadowRadius: 6,
                                        elevation: newPasswordFocused ? 4 : 1,
                                    }}
                                >
                                    <Lock size={20} color="#64748b" />
                                    <TextInput
                                        className="flex-1 px-3 py-4 text-base text-slate-800"
                                        placeholder={isForgotPasswordMode ? 'Create a new password' : 'Create a password'}
                                        placeholderTextColor="#9ca3af"
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        secureTextEntry={!showNewPassword}
                                        autoCapitalize="none"
                                        onFocus={() => setNewPasswordFocused(true)}
                                        onBlur={() => setNewPasswordFocused(false)}
                                    />
                                    <TouchableOpacity onPress={() => setShowNewPassword((prev) => !prev)} hitSlop={8}>
                                        {showNewPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View className="mb-4">
                                <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Confirm Password</Text>
                                <View
                                    className={`flex-row items-center bg-white rounded-2xl px-4 border-2 ${
                                        passwordsMatch
                                            ? 'border-emerald-400'
                                            : passwordsMismatch
                                                ? 'border-red-300'
                                                : confirmPasswordFocused
                                                    ? 'border-blue-500'
                                                    : 'border-gray-200'
                                    }`}
                                    style={{
                                        shadowColor: confirmPasswordFocused ? '#2563eb' : '#000',
                                        shadowOffset: { width: 0, height: 2 },
                                        shadowOpacity: confirmPasswordFocused ? 0.15 : 0.04,
                                        shadowRadius: 6,
                                        elevation: confirmPasswordFocused ? 4 : 1,
                                    }}
                                >
                                    <Lock size={20} color="#64748b" />
                                    <TextInput
                                        className="flex-1 px-3 py-4 text-base text-slate-800"
                                        placeholder="Re-enter your password"
                                        placeholderTextColor="#9ca3af"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry={!showConfirmPassword}
                                        autoCapitalize="none"
                                        onFocus={() => setConfirmPasswordFocused(true)}
                                        onBlur={() => setConfirmPasswordFocused(false)}
                                    />
                                    <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)} hitSlop={8}>
                                        {showConfirmPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={() => {
                                    void handleSubmitPassword();
                                }}
                                disabled={loading || !canSubmit}
                                activeOpacity={0.85}
                                className={`rounded-2xl items-center justify-center py-4 ${
                                    loading || !canSubmit ? 'bg-blue-300' : 'bg-blue-600'
                                }`}
                                style={{
                                    shadowColor: '#1d4ed8',
                                    shadowOffset: { width: 0, height: 6 },
                                    shadowOpacity: 0.35,
                                    shadowRadius: 12,
                                    elevation: 8,
                                }}
                            >
                                {loading ? (
                                    <View className="flex-row items-center">
                                        <ActivityIndicator color="#fff" size="small" />
                                        <Text className="text-white font-bold ml-3 text-lg">
                                            {isForgotPasswordMode ? 'Resetting password...' : 'Saving password...'}
                                        </Text>
                                    </View>
                                ) : (
                                    <View className="flex-row items-center">
                                        <Text className="text-white font-extrabold mr-2 tracking-wide text-lg">
                                            {isForgotPasswordMode ? 'Reset Password' : 'Set Password'}
                                        </Text>
                                        <ArrowRight size={20} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
