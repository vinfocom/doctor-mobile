import React, { useEffect, useMemo, useState } from 'react';
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
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
    getLoginChallenge,
    login,
    patientLogin,
    saveDoctorPushToken,
    savePatientPushToken,
    verifyLoginChallenge,
} from '../api/auth';
import { setAuthSession, type AppRole } from '../api/token';
import { useAuthSession } from '../context/AuthSessionContext';
import { registerForPushNotificationsAsync } from '../hooks/usePushNotifications';
import { Stethoscope, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, RefreshCw, Calculator, Check } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { API_URL } from '../config/env';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;
const pushDebug = (...args: unknown[]) => {
    if (__DEV__) {
        console.log(...args);
    }
};
const pushWarn = (...args: unknown[]) => {
    console.warn(...args);
};

async function registerPushTokenForRole(role: 'DOCTOR' | 'PATIENT', authToken?: string) {
    try {
        const pushToken = await registerForPushNotificationsAsync();
        if (!pushToken?.data) {
            pushDebug(`[push] ${role.toLowerCase()} login flow: no push token generated`);
            pushWarn(`[push] ${role.toLowerCase()} login flow: no push token generated`);
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
        pushWarn(`[push] ${role.toLowerCase()} login flow: failed to register/save push token`, error);
    }
}

const LoginScreen = () => {
    const insets = useSafeAreaInsets();
    const { height: screenHeight, width: screenWidth, fontScale } = useWindowDimensions();
    const navigation = useNavigation<LoginScreenNavigationProp>();
    const { refreshSession } = useAuthSession();
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'DOCTOR' | 'PATIENT'>('DOCTOR');
    const [patientIdentifier, setPatientIdentifier] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [challengeQuestion, setChallengeQuestion] = useState('');
    const [challengeId, setChallengeId] = useState('');
    const [challengeAnswer, setChallengeAnswer] = useState('');
    const [challengeVerificationToken, setChallengeVerificationToken] = useState('');
    const [challengeVerified, setChallengeVerified] = useState(false);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [verifyingChallenge, setVerifyingChallenge] = useState(false);
    const [challengeStatus, setChallengeStatus] = useState<'idle' | 'success'>('idle');
    const [answerInputActive, setAnswerInputActive] = useState(false);

    const isCompactScreen = screenHeight < 760;
    const isVeryCompactScreen = screenHeight < 700;
    const isNarrowScreen = screenWidth < 360;
    const isLargeText = fontScale > 1.15;
    const verificationBoxWidth = isVeryCompactScreen || isNarrowScreen || isLargeText ? 84 : 96;
    const verificationBoxHeight = isVeryCompactScreen || isLargeText ? 52 : 56;
    const verificationFontSize = isVeryCompactScreen || isLargeText ? 24 : 28;

    const canAttemptLogin = useMemo(
        () =>
            mode === 'DOCTOR'
                ? Boolean(email.trim() && password && challengeAnswer.trim())
                : Boolean(patientIdentifier.trim() && challengeAnswer.trim()),
        [challengeAnswer, email, mode, password, patientIdentifier]
    );

    const loadLoginChallenge = async (clearAnswer = true) => {
        setChallengeLoading(true);
        setChallengeVerified(false);
        setChallengeVerificationToken('');
        setChallengeStatus('idle');
        try {
            const challenge = await getLoginChallenge();
            setChallengeQuestion(challenge.question);
            setChallengeId(challenge.challengeId);
            if (clearAnswer) {
                setChallengeAnswer('');
                setAnswerInputActive(false);
            }
        } catch {
            setChallengeQuestion('');
            setChallengeId('');
        } finally {
            setChallengeLoading(false);
        }
    };

    const handleVerifyChallenge = async (answer: string) => {
        if (!challengeId || !answer.trim()) return;
        if (challengeVerified) return;
        setVerifyingChallenge(true);
        setChallengeVerified(false);
        setChallengeVerificationToken('');
        setChallengeStatus('idle');

        try {
            const response = await verifyLoginChallenge(challengeId, answer.trim());
            setChallengeVerificationToken(response?.verificationToken || '');
            setChallengeVerified(true);
            setChallengeStatus('success');
        } catch {
            setChallengeVerified(false);
        } finally {
            setVerifyingChallenge(false);
        }
    };

    useEffect(() => {
        loadLoginChallenge();
    }, [mode]);

    useEffect(() => {
        if (challengeVerified) {
            setChallengeVerified(false);
            setChallengeVerificationToken('');
            setChallengeStatus('idle');
        }
    }, [challengeAnswer]);

    useEffect(() => {
        if (mode !== 'DOCTOR' && mode !== 'PATIENT') return;
        if (!challengeAnswer.trim() || !challengeId || challengeLoading || challengeVerified) return;

        const timer = setTimeout(() => {
            handleVerifyChallenge(challengeAnswer);
        }, 250);

        return () => clearTimeout(timer);
    }, [challengeAnswer, challengeId, challengeLoading, challengeVerified, mode]);

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

    const handleLogin = async () => {
        // Alert.alert('API Check', `Using API URL:\n${API_URL}`);
        setLoading(true);
        try {
            if (mode === 'DOCTOR') {
                if (!email || !password) {
                    Alert.alert('Error', 'Please enter email and password');
                    return;
                }
                if (!challengeId || !challengeVerified || !challengeVerificationToken) {
                    Alert.alert('Verification Required', 'Please solve and verify the calculation before logging in.');
                    return;
                }
                const response = await login(
                    email.trim(),
                    password,
                    challengeId,
                    challengeVerificationToken
                );
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
                if (!challengeId || !challengeVerified || !challengeVerificationToken) {
                    Alert.alert('Verification Required', 'Please solve and verify the calculation before logging in.');
                    return;
                }
                const response = await patientLogin(
                    patientIdentifier.trim(),
                    challengeId,
                    challengeVerificationToken
                );
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

            if (status === 400) {
                setChallengeVerified(false);
                await loadLoginChallenge();
            }

            if (status === 401 || status === 404) {
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
        <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom + 20, 28),
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    showsVerticalScrollIndicator={false}
                    className="bg-gray-50"
                    scrollIndicatorInsets={{ bottom: keyboardVisible ? 12 : Math.max(insets.bottom + 20, 28) }}
                >
                        {/* ── Header ── */}
                        <SafeAreaView edges={['top']} className="bg-blue-700">
                        <Animated.View
                            entering={FadeInDown.duration(600).springify()}
                            className={`bg-blue-700 items-center ${
                                isNarrowScreen ? 'px-6' : 'px-8'
                            } ${
                                isVeryCompactScreen ? 'pt-5 pb-8' : isCompactScreen ? 'pt-6 pb-10' : 'pt-8 pb-12'
                            }`}
                        >
                            {/* Avatar */}
                            <View
                                className={`rounded-full bg-white items-center justify-center shadow-lg ${
                                    isVeryCompactScreen
                                        ? 'w-16 h-16 mb-3'
                                        : isCompactScreen
                                            ? 'w-[72px] h-[72px] mb-3'
                                            : 'w-20 h-20 mb-4'
                                }`}
                            >
                                <Stethoscope size={isVeryCompactScreen ? 30 : isCompactScreen ? 34 : 40} color="#1d4ed8" />
                            </View>

                            <Text
                                className={`text-white font-extrabold tracking-wide mb-1 text-center ${
                                    isVeryCompactScreen ? 'text-[26px]' : isCompactScreen ? 'text-[28px]' : 'text-[32px]'
                                }`}
                            >
                                {mode === 'DOCTOR' ? 'Doctor & Staff Portal' : 'Patient Portal'}
                            </Text>
                            <Text className={`text-blue-200 text-center ${isVeryCompactScreen ? 'text-xs' : 'text-sm'}`}>
                                {mode === 'DOCTOR' ? 'Sign in to manage appointments and clinic access' : 'Sign in to chat with your doctor'}
                            </Text>
                        </Animated.View>
                        </SafeAreaView>

                        {/* ── Form Card ── */}
                        <Animated.View
                            entering={FadeInUp.delay(200).duration(500)}
                            className={`bg-gray-50 ${
                                isVeryCompactScreen ? 'px-5 pt-4 pb-4 -mt-4' : isCompactScreen ? 'px-5 pt-5 pb-4 -mt-5' : 'px-6 pt-6 pb-5 -mt-6'
                            }`}
                            style={{ borderTopLeftRadius: 36, borderTopRightRadius: 36 }}
                        >
                            {/* Greeting */}
                            <View className={`items-center ${isVeryCompactScreen ? 'mb-3' : isCompactScreen ? 'mb-4' : 'mb-5'}`}>
                                <Text
                                    className={`font-extrabold text-slate-800 mb-1 ${
                                        isVeryCompactScreen ? 'text-2xl' : isCompactScreen ? 'text-[26px]' : 'text-[28px]'
                                    }`}
                                >
                                    Hi Doctor 👋
                                </Text>
                                <Text className={`text-slate-400 text-center ${isVeryCompactScreen ? 'text-xs' : 'text-sm'}`}>
                                    Please enter your credentials to continue
                                </Text>
                            </View>

                            <View className={`bg-white border border-gray-200 rounded-2xl p-1 flex-row ${isVeryCompactScreen ? 'mb-3' : 'mb-4'}`}>
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
                                    <View className="mb-0.5">
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
                                                className={`flex-1 px-3 text-base text-slate-800 ${isVeryCompactScreen ? 'py-3.5' : 'py-4'}`}
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
                                    <View className="mb-0.5">
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
                                                className={`flex-1 px-3 text-base text-slate-800 ${isVeryCompactScreen ? 'py-3.5' : 'py-4'}`}
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

                                    <View className="mb-1">
                                        <View className="flex-row items-center justify-between mb-2">
                                            <Text className="text-base font-bold text-gray-700 ml-1">
                                                Quick Verification
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() => loadLoginChallenge()}
                                                disabled={challengeLoading || verifyingChallenge}
                                                className="flex-row items-center"
                                            >
                                                <RefreshCw size={14} color="#2563eb" />
                                            </TouchableOpacity>
                                        </View>

                                        <View
                                            className={`bg-white border border-blue-100 rounded-2xl px-4 ${
                                                isVeryCompactScreen ? 'py-2 mb-1.5' : 'py-2.5 mb-2'
                                            }`}
                                        >
                                            <View className="flex-row items-center pl-3">
                                                <View className="flex-1 min-w-0 flex-row items-center flex-wrap">
                                                    <Calculator size={24} color="#2563eb" />
                                                {challengeLoading ? (
                                                    <Text className="text-slate-800 font-bold text-2xl ml-3 shrink">
                                                        Loading calculation...
                                                    </Text>
                                                ) : challengeQuestion ? (
                                                    <View className="flex-1 min-w-0 flex-row items-center flex-wrap ml-4">
                                                        <Text
                                                            className={`text-slate-800 font-bold mr-2 shrink ${
                                                                isVeryCompactScreen || isLargeText ? 'text-[24px]' : 'text-[28px]'
                                                            }`}
                                                        >
                                                            {challengeQuestion.replace('?', '')}
                                                        </Text>
                                                        {challengeAnswer === '' && !answerInputActive && !challengeVerified ? (
                                                            <TouchableOpacity
                                                                activeOpacity={0.9}
                                                                onPress={() => setAnswerInputActive(true)}
                                                                className="bg-white items-center justify-center ml-2 px-2 rounded-2xl border border-blue-200 shrink-0"
                                                                style={{ width: verificationBoxWidth, height: verificationBoxHeight }}
                                                            >
                                                                <Text className="font-bold text-gray-400" style={{ fontSize: verificationFontSize }}>?</Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <TextInput
                                                                autoFocus={answerInputActive && !challengeVerified}
                                                                className="bg-white text-center font-bold text-slate-800 ml-2 px-2 rounded-2xl border border-blue-200 shrink-0"
                                                                placeholder="?"
                                                                placeholderTextColor="#9ca3af"
                                                                value={challengeAnswer}
                                                                onChangeText={(text) => {
                                                                    setChallengeAnswer(text);
                                                                    if (text === '' && !challengeVerified) {
                                                                        setAnswerInputActive(false);
                                                                    }
                                                                }}
                                                                onBlur={() => {
                                                                    if (!challengeAnswer && !challengeVerified) {
                                                                        setAnswerInputActive(false);
                                                                    }
                                                                }}
                                                                keyboardType="number-pad"
                                                                maxLength={4}
                                                                editable={!challengeLoading && !challengeVerified}
                                                                style={{
                                                                    width: verificationBoxWidth,
                                                                    height: verificationBoxHeight,
                                                                    textAlign: 'center',
                                                                    fontSize: verificationFontSize,
                                                                    lineHeight: verificationFontSize + 4,
                                                                }}
                                                            />
                                                        )}
                                                    </View>
                                                ) : (
                                                    <Text className="text-slate-800 font-bold text-2xl ml-3 shrink">
                                                        Calculation unavailable
                                                    </Text>
                                                )}
                                                </View>
                                                <View className="ml-3 w-9 h-9 items-center justify-center shrink-0">
                                                    {verifyingChallenge ? (
                                                        <ActivityIndicator color="#2563eb" size="small" />
                                                    ) : challengeStatus === 'success' ? (
                                                        <Animated.View
                                                            entering={ZoomIn.duration(220)}
                                                            className="w-9 h-9 rounded-xl bg-emerald-500 items-center justify-center"
                                                        >
                                                            <Check size={18} color="#fff" />
                                                        </Animated.View>
                                                    ) : null}
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View className={isVeryCompactScreen ? 'mb-3.5' : 'mb-4'}>
                                        <Text className="text-base font-bold text-gray-700 mb-2 ml-1">
                                            Phone or Telegram Username
                                        </Text>
                                        <View className="flex-row items-center bg-white rounded-2xl px-4 border-2 border-gray-200">
                                            <Mail size={20} color="#64748b" />
                                            <TextInput
                                                className={`flex-1 px-3 text-base text-slate-800 ${isVeryCompactScreen ? 'py-3.5' : 'py-4'}`}
                                                placeholder="e.g. 9392569600 or username"
                                                placeholderTextColor="#9ca3af"
                                                value={patientIdentifier}
                                                onChangeText={setPatientIdentifier}
                                                autoCapitalize="none"
                                            />
                                        </View>
                                    </View>

                                    <View className="mb-2">
                                        <View className="flex-row items-center justify-between mb-2">
                                            <Text className="text-base font-bold text-gray-700 ml-1">
                                                Quick Verification
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() => loadLoginChallenge()}
                                                disabled={challengeLoading || verifyingChallenge}
                                                className="flex-row items-center"
                                            >
                                                <RefreshCw size={14} color="#2563eb" />
                                            </TouchableOpacity>
                                        </View>

                                        <View
                                            className={`bg-white border border-blue-100 rounded-2xl px-4 ${
                                                isVeryCompactScreen ? 'py-2 mb-1.5' : 'py-2.5 mb-2'
                                            }`}
                                        >
                                            <View className="flex-row items-center pl-3">
                                                <View className="flex-1 min-w-0 flex-row items-center flex-wrap">
                                                    <Calculator size={24} color="#2563eb" />
                                                {challengeLoading ? (
                                                    <Text className="text-slate-800 font-bold text-2xl ml-3 shrink">
                                                        Loading calculation...
                                                    </Text>
                                                ) : challengeQuestion ? (
                                                    <View className="flex-1 min-w-0 flex-row items-center flex-wrap ml-4">
                                                        <Text
                                                            className={`text-slate-800 font-bold mr-2 shrink ${
                                                                isVeryCompactScreen || isLargeText ? 'text-[24px]' : 'text-[28px]'
                                                            }`}
                                                        >
                                                            {challengeQuestion.replace('?', '')}
                                                        </Text>
                                                        {challengeAnswer === '' && !answerInputActive && !challengeVerified ? (
                                                            <TouchableOpacity
                                                                activeOpacity={0.9}
                                                                onPress={() => setAnswerInputActive(true)}
                                                                className="bg-white items-center justify-center ml-2 px-2 rounded-2xl border border-blue-200 shrink-0"
                                                                style={{ width: verificationBoxWidth, height: verificationBoxHeight }}
                                                            >
                                                                <Text className="font-bold text-gray-400" style={{ fontSize: verificationFontSize }}>?</Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <TextInput
                                                                autoFocus={answerInputActive && !challengeVerified}
                                                                className="bg-white text-center font-bold text-slate-800 ml-2 px-2 rounded-2xl border border-blue-200 shrink-0"
                                                                placeholder="?"
                                                                placeholderTextColor="#9ca3af"
                                                                value={challengeAnswer}
                                                                onChangeText={(text) => {
                                                                    setChallengeAnswer(text);
                                                                    if (text === '' && !challengeVerified) {
                                                                        setAnswerInputActive(false);
                                                                    }
                                                                }}
                                                                onBlur={() => {
                                                                    if (!challengeAnswer && !challengeVerified) {
                                                                        setAnswerInputActive(false);
                                                                    }
                                                                }}
                                                                keyboardType="number-pad"
                                                                maxLength={4}
                                                                editable={!challengeLoading && !challengeVerified}
                                                                style={{
                                                                    width: verificationBoxWidth,
                                                                    height: verificationBoxHeight,
                                                                    textAlign: 'center',
                                                                    fontSize: verificationFontSize,
                                                                    lineHeight: verificationFontSize + 4,
                                                                }}
                                                            />
                                                        )}
                                                    </View>
                                                ) : (
                                                    <Text className="text-slate-800 font-bold text-2xl ml-3 shrink">
                                                        Calculation unavailable
                                                    </Text>
                                                )}
                                                </View>
                                                <View className="ml-3 w-9 h-9 items-center justify-center shrink-0">
                                                    {verifyingChallenge ? (
                                                        <ActivityIndicator color="#2563eb" size="small" />
                                                    ) : challengeStatus === 'success' ? (
                                                        <Animated.View
                                                            entering={ZoomIn.duration(220)}
                                                            className="w-9 h-9 rounded-xl bg-emerald-500 items-center justify-center"
                                                        >
                                                            <Check size={18} color="#fff" />
                                                        </Animated.View>
                                                    ) : null}
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* Login Button */}
                            <TouchableOpacity
                                onPress={handleLogin}
                                disabled={loading || !canAttemptLogin}
                                activeOpacity={0.8}
                                className={`rounded-2xl items-center justify-center ${
                                    isVeryCompactScreen ? 'py-3.5' : 'py-4'
                                } ${loading || !canAttemptLogin ? 'bg-blue-300' : 'bg-blue-600'
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
                                        <Text
                                            className={`text-white font-bold ml-3 ${isVeryCompactScreen || isLargeText ? 'text-base' : 'text-lg'}`}
                                            maxFontSizeMultiplier={1.15}
                                        >
                                            Signing in...
                                        </Text>
                                    </View>
                                ) : (
                                    <View className="flex-row items-center">
                                        <Text
                                            className={`text-white font-extrabold mr-2 tracking-wide ${
                                                isVeryCompactScreen || isLargeText ? 'text-base' : 'text-lg'
                                            }`}
                                            numberOfLines={2}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.85}
                                            maxFontSizeMultiplier={1.1}
                                            style={{ flexShrink: 1, textAlign: 'center' }}
                                        >
                                            {mode === 'DOCTOR' ? 'Sign In as Doctor / Staff' : 'Sign In as Patient'}
                                        </Text>
                                        <ArrowRight size={20} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>

                            {/* Security Note */}
                            <View className={`px-4 ${isVeryCompactScreen ? 'mt-3' : 'mt-4'}`}>
                                <View className="flex-row items-center justify-center">
                                    <ShieldCheck size={14} color="#9ca3af" />
                                    <Text className="text-xs text-gray-400 text-center ml-2" maxFontSizeMultiplier={1.2}>
                                        Authorized medical personnel only.{'\n'}Your session is encrypted and secure.
                                    </Text>
                                </View>
                            </View>
                        </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default LoginScreen;
