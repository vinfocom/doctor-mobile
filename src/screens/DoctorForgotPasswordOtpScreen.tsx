import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
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
import { ArrowLeft, Check, Mail, ShieldCheck } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import {
    sendUserForgotPasswordOtp,
    verifyUserForgotPasswordOtp,
} from '../api/auth';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DoctorForgotPasswordOtp'>;
type OtpRoute = RouteProp<RootStackParamList, 'DoctorForgotPasswordOtp'>;

const OTP_LENGTH = 6;

function getOtpRequestErrorMessage(error: any) {
    const status = error?.response?.status;
    const responseMessage = error?.response?.data?.error || '';
    const resendAfterSeconds = Number(error?.response?.data?.resendAfterSeconds || 0);

    if (status === 404) return 'Doctor or clinic staff account not found.';
    if (status === 429) return resendAfterSeconds > 0 ? `Wait ${resendAfterSeconds}s to resend OTP.` : responseMessage || 'Wait before requesting OTP.';
    if (status === 502) return 'Email send failed. Please try again in a moment.';
    if (!status) return 'Network error. Please check your internet connection.';
    return responseMessage || 'Unable to send OTP right now. Please try again.';
}

function getOtpVerifyErrorMessage(error: any) {
    const status = error?.response?.status;
    const responseMessage = error?.response?.data?.error || '';

    if (/expired/i.test(responseMessage)) return 'OTP expired.';
    if (/invalid otp/i.test(responseMessage)) return 'Invalid OTP.';
    if (status === 429 || /maximum otp verification attempts exceeded/i.test(responseMessage)) {
        return 'Too many OTP attempts.';
    }
    if (!status) return 'Check your internet connection.';
    return responseMessage || 'Unable to verify OTP.';
}

function maskEmail(email: string) {
    const normalized = String(email || '').trim();
    const [name, domain] = normalized.split('@');
    if (!name || !domain) return normalized;
    if (name.length <= 2) return `${name[0] || ''}***@${domain}`;
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export default function DoctorForgotPasswordOtpScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<OtpRoute>();
    const insets = useSafeAreaInsets();
    const otpInputRef = useRef<TextInput>(null);
    const lastSubmittedOtpRef = useRef('');

    const { email, resendAfterSeconds = 30 } = route.params;

    const [otpLoading, setOtpLoading] = useState(false);
    const [otpValue, setOtpValue] = useState('');
    const [otpVerified, setOtpVerified] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(resendAfterSeconds);
    const [statusMessage, setStatusMessage] = useState('Enter the OTP sent to your email.');
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const canResend = useMemo(() => resendCountdown <= 0 && !otpLoading, [otpLoading, resendCountdown]);

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

    useEffect(() => {
        const timer = setTimeout(() => {
            otpInputRef.current?.focus();
        }, 180);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = setTimeout(() => {
            setResendCountdown((current) => Math.max(0, current - 1));
        }, 1000);
        return () => clearTimeout(timer);
    }, [resendCountdown]);

    useEffect(() => {
        const trimmedOtp = otpValue.trim();
        if (
            trimmedOtp.length !== OTP_LENGTH ||
            otpLoading ||
            otpVerified ||
            lastSubmittedOtpRef.current === trimmedOtp
        ) {
            return;
        }

        const timer = setTimeout(() => {
            void handleVerifyOtp(trimmedOtp);
        }, 120);

        return () => clearTimeout(timer);
    }, [otpLoading, otpValue, otpVerified]);

    const handleVerifyOtp = async (providedOtp?: string) => {
        const currentOtp = String(providedOtp || otpValue).trim();
        if (currentOtp.length !== OTP_LENGTH || otpLoading || otpVerified) return;

        lastSubmittedOtpRef.current = currentOtp;
        setOtpLoading(true);
        setStatusMessage('Verifying OTP...');
        try {
            const response = await verifyUserForgotPasswordOtp(email, currentOtp);
            setOtpVerified(true);
            setStatusMessage('OTP verified successfully.');
            navigation.replace('DoctorResetPassword', {
                email,
                verificationToken: response.verificationToken,
            });
        } catch (error: any) {
            setOtpVerified(false);
            setStatusMessage(getOtpVerifyErrorMessage(error));
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (!canResend) return;

        setOtpLoading(true);
        try {
            const response = await sendUserForgotPasswordOtp(email);
            setOtpValue('');
            setOtpVerified(false);
            lastSubmittedOtpRef.current = '';
            setResendCountdown(response?.resendAfterSeconds || 30);
            setStatusMessage('A new OTP has been sent.');
            setTimeout(() => {
                otpInputRef.current?.focus();
            }, 80);
        } catch (error: any) {
            const retryAfter = Number(error?.response?.data?.resendAfterSeconds || 0);
            if (retryAfter > 0) {
                setResendCountdown(retryAfter);
            }
            setStatusMessage(getOtpRequestErrorMessage(error));
        } finally {
            setOtpLoading(false);
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
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    showsVerticalScrollIndicator={false}
                >
                    <View className="flex-1 px-6 pt-4 pb-6">
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
                                <Mail size={36} color="#2563eb" />
                            </View>
                            <Text className="mt-6 text-3xl font-extrabold text-slate-900">Verify OTP</Text>
                            <Text className="mt-3 text-center text-base leading-6 text-slate-600">
                                Enter the OTP sent to {maskEmail(email)}.
                            </Text>
                        </Animated.View>

                        <Animated.View
                            entering={FadeInDown.delay(120)}
                            className="mt-8 rounded-[28px] bg-white px-5 py-6 shadow-sm"
                        >
                            <View className="items-center">
                                <Text className="text-sm font-semibold uppercase tracking-[2px] text-blue-600">
                                    OTP Verification
                                </Text>
                                <Text className="mt-3 text-center text-slate-600">{statusMessage}</Text>
                            </View>

                            <View className="mt-6">
                                <Text className="mb-3 text-sm font-semibold text-slate-700">OTP</Text>
                                <TouchableOpacity
                                    activeOpacity={0.95}
                                    onPress={() => otpInputRef.current?.focus()}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4"
                                    style={{
                                        minHeight: 68,
                                        justifyContent: 'center',
                                    }}
                                >
                                    {!otpValue ? (
                                        <Text
                                            pointerEvents="none"
                                            className="absolute left-0 right-0 text-center text-slate-400 font-semibold"
                                            style={{ fontSize: 18 }}
                                        >
                                            Enter OTP
                                        </Text>
                                    ) : null}
                                    <TextInput
                                        ref={otpInputRef}
                                        value={otpValue}
                                        onChangeText={(value) => {
                                            const numericValue = String(value || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
                                            setOtpValue(numericValue);
                                            lastSubmittedOtpRef.current = '';
                                            if (numericValue.length < OTP_LENGTH) {
                                                setOtpVerified(false);
                                                setStatusMessage('Enter the OTP sent to your email.');
                                            }
                                        }}
                                        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                                        textContentType="oneTimeCode"
                                        autoComplete="one-time-code"
                                        placeholder=""
                                        className="text-center font-extrabold text-slate-900"
                                        maxLength={OTP_LENGTH}
                                        editable={!otpLoading}
                                        autoFocus
                                        selectionColor="#2563eb"
                                        style={{
                                            fontSize: 28,
                                            lineHeight: 32,
                                            letterSpacing: otpValue ? 10 : 1,
                                            paddingTop: 0,
                                            paddingBottom: 0,
                                            height: 40,
                                            textAlign: 'center',
                                            textAlignVertical: 'center',
                                            includeFontPadding: false,
                                        }}
                                    />
                                </TouchableOpacity>
                            </View>

                            <View className="mt-6 items-center">
                                {otpLoading ? (
                                    <View className="flex-row items-center">
                                        <ActivityIndicator color="#2563eb" />
                                        <Text className="ml-3 text-blue-700 font-semibold">Processing OTP...</Text>
                                    </View>
                                ) : otpVerified ? (
                                    <Animated.View entering={ZoomIn} className="flex-row items-center rounded-full bg-emerald-50 px-4 py-2">
                                        <Check size={18} color="#047857" />
                                        <Text className="ml-2 text-emerald-700 font-semibold">OTP verified successfully.</Text>
                                    </Animated.View>
                                ) : null}
                            </View>

                            <View className="mt-8 items-center">
                                <Text className="text-sm text-slate-500">
                                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Didn't receive the OTP?"}
                                </Text>
                                {canResend ? (
                                    <Text className="mt-2 text-center text-sm text-amber-700">
                                        Check your spam or promotions folder if the OTP email is not in your inbox.
                                    </Text>
                                ) : null}
                                <TouchableOpacity
                                    onPress={() => {
                                        void handleResendOtp();
                                    }}
                                    disabled={!canResend}
                                    activeOpacity={0.85}
                                    className="mt-3"
                                >
                                    <Text className={`text-base font-semibold ${canResend ? 'text-blue-600' : 'text-slate-400'}`}>
                                        Resend OTP
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                                <View className="flex-row">
                                    <ShieldCheck size={20} color="#2563eb" />
                                    <Text className="ml-3 flex-1 text-sm leading-5 text-blue-900">
                                        OTP will be verified automatically as soon as all 6 digits are entered.
                                    </Text>
                                </View>
                            </View>
                        </Animated.View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
