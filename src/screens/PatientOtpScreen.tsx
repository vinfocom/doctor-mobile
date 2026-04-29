import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Smartphone } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import {
    sendPatientOtp,
    verifyPatientOtp,
} from '../api/auth';
import type { RootStackParamList } from '../navigation/types';
import {
    addSmsDeniedListener,
    addSmsErrorListener,
    addSmsListener,
    removeSmsListener,
    startSmsUserConsent,
} from '../native/smsUserConsent';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PatientOtp'>;
type OtpRoute = RouteProp<RootStackParamList, 'PatientOtp'>;
type SmsConsentCleanup = (() => void) | null;

const OTP_LENGTH = 6;

function extractOtpFromMessage(message: string) {
    const match = String(message || '').match(/\b\d{4,6}\b/);
    return match?.[0] || '';
}

async function tryStartSmsUserConsent(
    onOtp: (otp: string) => void,
    onDenied: () => void,
    onError: (message: string) => void
): Promise<SmsConsentCleanup> {
    if (Platform.OS !== 'android') return null;

    try {
        await startSmsUserConsent();

        const smsListener = addSmsListener((event) => {
            const otp = extractOtpFromMessage(event?.message || '');
            if (otp) onOtp(otp);
        });
        const deniedListener = addSmsDeniedListener(() => {
            onDenied();
        });
        const errorListener = addSmsErrorListener((event) => {
            onError(event?.message || 'SMS consent error');
        });

        return () => {
            smsListener?.remove();
            deniedListener?.remove();
            errorListener?.remove();
            removeSmsListener();
        };
    } catch (error) {
        if (__DEV__) {
            console.warn('[otp] SMS User Consent bridge is not available yet', error);
        }
    }

    return null;
}

function getOtpRequestErrorMessage(error: any) {
    const status = error?.response?.status;
    const responseMessage = error?.response?.data?.error || '';

    if (status === 404) return 'Patient not found. Please create an account.';
    if (/already set/i.test(responseMessage)) return 'Password already set. Please log in or use forgot password.';
    if (/does not have a password yet|use set password/i.test(responseMessage)) {
        return 'This account does not have a password yet. Please use the set password flow.';
    }
    if (status === 429) return responseMessage || 'Please wait before requesting another OTP.';
    if (status === 502) return 'SMS send failed. Please try again in a moment.';
    if (!status) return 'Network error. Please check your internet connection.';
    return responseMessage || 'Unable to send OTP right now. Please try again.';
}

function getOtpVerifyErrorMessage(error: any) {
    const status = error?.response?.status;
    const responseMessage = error?.response?.data?.error || '';

    if (/expired/i.test(responseMessage)) return 'OTP expired. Please request a new OTP.';
    if (/invalid otp/i.test(responseMessage)) return 'Invalid OTP. Please try again.';
    if (status === 429 || /maximum otp verification attempts exceeded/i.test(responseMessage)) {
        return 'Maximum OTP verification attempts exceeded. Please request a new OTP.';
    }
    if (!status) return 'Network error. Please check your internet connection.';
    return responseMessage || 'Unable to verify OTP right now.';
}

function maskPhone(phone: string) {
    const cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.length <= 4) return cleaned;
    return `${cleaned.slice(0, 2)}${'*'.repeat(Math.max(0, cleaned.length - 4))}${cleaned.slice(-2)}`;
}

export default function PatientOtpScreen() {
    const navigation = useNavigation<Nav>();
    const route = useRoute<OtpRoute>();
    const insets = useSafeAreaInsets();
    const smsConsentCleanupRef = useRef<SmsConsentCleanup>(null);
    const otpInputRef = useRef<TextInput>(null);

    const { phone, purpose, forgotPasswordMode } = route.params;

    const [otpLoading, setOtpLoading] = useState(false);
    const [otpValue, setOtpValue] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [otpVerified, setOtpVerified] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);
    const [canResend, setCanResend] = useState(false);
    const [awaitingSmsConsent, setAwaitingSmsConsent] = useState(false);
    const [otpAutofillMessage, setOtpAutofillMessage] = useState('');
    const [otpInputFocused, setOtpInputFocused] = useState(false);
    const [showOtpCaret, setShowOtpCaret] = useState(true);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const isForgotPasswordMode = forgotPasswordMode || purpose === 'RESET_PASSWORD';
    const screenTitle = isForgotPasswordMode ? 'Verify OTP' : 'Set Password with OTP';
    const screenSubtitle = isForgotPasswordMode
        ? 'We will verify your phone before resetting the password.'
        : 'We will verify your phone before creating the password.';

    const canVerifyOtp = useMemo(
        () => Boolean(otpSent && !otpVerified && otpValue.trim().length === OTP_LENGTH),
        [otpSent, otpValue, otpVerified]
    );

    const stopSmsConsentListener = () => {
        smsConsentCleanupRef.current?.();
        smsConsentCleanupRef.current = null;
        setAwaitingSmsConsent(false);
    };

    const focusOtpInput = () => {
        if (otpVerified) return;
        setOtpInputFocused(true);

        // Android can keep a hidden input "focused" after the keyboard is dismissed.
        // A quick blur/focus cycle reliably reopens the numeric keyboard.
        otpInputRef.current?.blur();
        setTimeout(() => {
            otpInputRef.current?.focus();
        }, 40);
    };

    useEffect(() => {
        if (resendCountdown <= 0) return;

        const timer = setTimeout(() => {
            setResendCountdown((current) => Math.max(0, current - 1));
        }, 1000);

        return () => clearTimeout(timer);
    }, [resendCountdown]);

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
        setCanResend(Boolean(otpSent && resendCountdown <= 0));
    }, [otpSent, resendCountdown]);

    useEffect(() => {
        if (!otpInputFocused || otpVerified) {
            setShowOtpCaret(true);
            return;
        }

        const timer = setInterval(() => {
            setShowOtpCaret((current) => !current);
        }, 500);

        return () => clearInterval(timer);
    }, [otpInputFocused, otpVerified]);

    const maybeStartSmsConsent = async () => {
        stopSmsConsentListener();
        setAwaitingSmsConsent(true);

        const cleanup = await tryStartSmsUserConsent(
            (otp) => {
                if (!otp) {
                    setOtpAutofillMessage('');
                    setAwaitingSmsConsent(false);
                    return;
                }

                setOtpValue(otp.slice(0, OTP_LENGTH));
                setOtpAutofillMessage('OTP detected from SMS. Verifying...');
                setAwaitingSmsConsent(false);
            },
            () => {
                setAwaitingSmsConsent(false);
                setOtpAutofillMessage('');
            },
            (message) => {
                setAwaitingSmsConsent(false);
                setOtpAutofillMessage(message && !/autofill is unavailable/i.test(message) ? message : '');
            }
        );

        smsConsentCleanupRef.current = cleanup;
        if (!cleanup) {
            setAwaitingSmsConsent(false);
            setOtpAutofillMessage('');
        }
    };

    const handleSendOtp = async (silent = false) => {
        setOtpLoading(true);
        try {
            const response = await sendPatientOtp(phone, purpose);
            setOtpSent(true);
            setOtpVerified(false);
            setOtpValue('');
            setResendCountdown(response?.resendAfterSeconds || 30);
            setCanResend(false);
            setOtpAutofillMessage('OTP sent to your phone. Enter it below to continue.');
            await maybeStartSmsConsent();
        } catch (error: any) {
            const status = error?.response?.status;
            const resendAfterSeconds = Number(error?.response?.data?.resendAfterSeconds || 0);
            if (status === 429 && resendAfterSeconds > 0) {
                setResendCountdown(resendAfterSeconds);
            }
            if (!silent) {
                Alert.alert('OTP Error', getOtpRequestErrorMessage(error));
            } else {
                setOtpAutofillMessage(getOtpRequestErrorMessage(error));
            }
        } finally {
            setOtpLoading(false);
        }
    };

    useEffect(() => {
        void handleSendOtp(true);
        return () => {
            stopSmsConsentListener();
        };
    }, []);

    const handleVerifyOtp = async () => {
        if (!otpValue.trim()) {
            Alert.alert('Error', 'Please enter OTP');
            return;
        }

        setOtpLoading(true);
        try {
            const response = await verifyPatientOtp(phone, purpose, otpValue.trim());
            const nextVerificationToken = response?.verificationToken || '';
            setOtpVerified(true);
            setOtpAutofillMessage('OTP verified successfully.');
            stopSmsConsentListener();

            if (nextVerificationToken) {
                navigation.replace('PatientResetPassword', {
                    phone,
                    verificationToken: nextVerificationToken,
                    purpose,
                });
            }
        } catch (error: any) {
            setOtpVerified(false);
            Alert.alert('OTP Verification Failed', getOtpVerifyErrorMessage(error));
        } finally {
            setOtpLoading(false);
        }
    };

    useEffect(() => {
        if (!otpSent || otpVerified || otpValue.trim().length !== OTP_LENGTH) return;

        const timer = setTimeout(() => {
            void handleVerifyOtp();
        }, 250);

        return () => clearTimeout(timer);
    }, [otpSent, otpValue, otpVerified]);

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

                            <Text className="text-white text-[30px] font-extrabold mb-2">{screenTitle}</Text>
                            <Text className="text-blue-100 text-sm leading-6">{screenSubtitle}</Text>
                        </Animated.View>
                    </SafeAreaView>

                    <Animated.View
                        entering={FadeInUp.delay(120).duration(450)}
                        className="px-6 pt-6 pb-6 -mt-6"
                        style={{ borderTopLeftRadius: 34, borderTopRightRadius: 34, backgroundColor: '#f8fafc' }}
                    >
                        <View className="bg-white rounded-[28px] border border-slate-200 px-4 py-4 mb-4">
                            <View className="flex-row items-center">
                                <View className="w-10 h-10 rounded-2xl bg-blue-50 items-center justify-center mr-3">
                                    <Smartphone size={20} color="#2563eb" />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-slate-800 text-base font-bold">OTP sent to</Text>
                                    <Text className="text-slate-500 text-sm mt-0.5">{maskPhone(phone)}</Text>
                                </View>
                            </View>
                            {otpAutofillMessage ? (
                                <Text className="text-xs text-slate-500 mt-2">{otpAutofillMessage}</Text>
                            ) : null}
                            {awaitingSmsConsent ? (
                                <Text className="text-xs text-blue-600 mt-2">Waiting for SMS consent...</Text>
                            ) : null}
                        </View>

                        <View className="bg-white rounded-[28px] border border-slate-200 px-5 py-5 mb-5">
                            <Text className="text-slate-800 text-lg font-bold mb-2">Enter OTP</Text>
                            <Text className="text-slate-500 text-sm mb-4">
                                {`Enter the ${OTP_LENGTH}-digit code.`}
                            </Text>

                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={focusOtpInput}
                                className="flex-row items-center justify-between"
                            >
                                {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                                    const digit = otpValue[index] ?? '';
                                    const isActive =
                                        !otpVerified &&
                                        otpInputFocused &&
                                        (index === otpValue.length || (otpValue.length === OTP_LENGTH && index === OTP_LENGTH - 1));
                                    return (
                                        <View
                                            key={index}
                                            className={`h-14 rounded-2xl border-2 items-center justify-center ${
                                                otpVerified
                                                    ? 'bg-emerald-50 border-emerald-300'
                                                    : isActive
                                                        ? 'bg-white border-blue-500'
                                                        : 'bg-slate-50 border-slate-200'
                                            }`}
                                            style={{ width: 44 }}
                                        >
                                            {digit ? (
                                                <Text className="text-xl font-extrabold text-slate-800">{digit}</Text>
                                            ) : isActive ? (
                                                showOtpCaret ? (
                                                    <View className="w-[2px] h-6 bg-blue-500 rounded-full" />
                                                ) : (
                                                    <View className="w-[2px] h-6 rounded-full bg-transparent" />
                                                )
                                            ) : (
                                                <Text className="text-xl font-extrabold text-slate-300">*</Text>
                                            )}
                                        </View>
                                    );
                                })}
                            </TouchableOpacity>

                            <TextInput
                                ref={otpInputRef}
                                value={otpValue}
                                onChangeText={(text) => setOtpValue(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                                keyboardType="number-pad"
                                maxLength={OTP_LENGTH}
                                editable={!otpVerified}
                                caretHidden
                                showSoftInputOnFocus
                                autoFocus
                                onFocus={() => setOtpInputFocused(true)}
                                onBlur={() => setOtpInputFocused(false)}
                                textContentType="oneTimeCode"
                                autoComplete="sms-otp"
                                style={{
                                    position: 'absolute',
                                    width: 1,
                                    height: 1,
                                    opacity: 0.01,
                                    color: 'transparent',
                                    left: 0,
                                    top: 0,
                                }}
                            />

                            {!otpVerified ? (
                                <TouchableOpacity
                                    onPress={() => {
                                        void handleVerifyOtp();
                                    }}
                                    disabled={otpLoading || !canVerifyOtp}
                                    activeOpacity={0.85}
                                    className={`rounded-2xl items-center justify-center py-4 mt-4 ${
                                        otpLoading || !canVerifyOtp ? 'bg-blue-300' : 'bg-blue-600'
                                    }`}
                                    style={{
                                        shadowColor: '#1d4ed8',
                                        shadowOffset: { width: 0, height: 6 },
                                        shadowOpacity: 0.35,
                                        shadowRadius: 12,
                                        elevation: 8,
                                    }}
                                >
                                    {otpLoading ? (
                                        <View className="flex-row items-center">
                                            <ActivityIndicator color="#fff" size="small" />
                                            <Text className="text-white font-bold ml-3 text-lg">Verifying OTP...</Text>
                                        </View>
                                    ) : (
                                        <View className="flex-row items-center">
                                            <Text className="text-white font-extrabold mr-2 tracking-wide text-lg">Verify OTP</Text>
                                            <ArrowRight size={20} color="#fff" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <View className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mt-4 flex-row items-center">
                                    <Animated.View entering={ZoomIn.duration(220)} className="w-9 h-9 rounded-xl bg-emerald-500 items-center justify-center mr-3">
                                        <Check size={18} color="#fff" />
                                    </Animated.View>
                                    <View className="flex-1">
                                        <Text className="text-emerald-700 font-semibold">OTP verified successfully.</Text>
                                        <Text className="text-emerald-600 text-xs mt-1">
                                            You can now {isForgotPasswordMode ? 'reset your password.' : 'create your password.'}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <View className="flex-row items-center justify-between mt-4">
                                <Text className="text-sm text-slate-500">
                                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Didn't receive the OTP?"}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        void handleSendOtp();
                                    }}
                                    disabled={otpLoading || !canResend}
                                    activeOpacity={0.85}
                                >
                                    <Text className={`font-semibold ${otpLoading || !canResend ? 'text-slate-400' : 'text-blue-600'}`}>
                                        Resend OTP
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
