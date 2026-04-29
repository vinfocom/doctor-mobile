import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    ArrowLeft,
    ArrowRight,
    Calculator,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Lock,
    Phone,
    RefreshCw,
    ShieldCheck,
    UserPlus,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import {
    checkPatientSignupAvailability,
    getLoginChallenge,
    patientSignup,
    savePatientPushToken,
    verifyLoginChallenge,
} from '../api/auth';
import { setAuthSession } from '../api/token';
import { useAuthSession } from '../context/AuthSessionContext';
import { registerForPushNotificationsAsync } from '../hooks/usePushNotifications';
import type { RootStackParamList } from '../navigation/types';

type SignupScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (value: number) => String(value).padStart(2, '0');
const ymdFromParts = (year: number, month: number, day: number) =>
    `${year}-${pad2(month)}-${pad2(day)}`;

const getTodayYMD = () => {
    const now = new Date();
    return ymdFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const formatDob = (value?: string) => {
    if (!value) return 'Select date of birth';
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(date.getTime())) return 'Select date of birth';

    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
};

const calculateAgeFromDob = (dob: string) => {
    if (!dob) return null;
    const [year, month, day] = dob.split('-').map(Number);
    const birthDate = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
        today.getMonth() > birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

    if (!hasHadBirthdayThisYear) age -= 1;
    if (age < 0 || age > 150) return null;
    return age;
};

async function registerPatientPushToken(authToken?: string) {
    try {
        const pushToken = await registerForPushNotificationsAsync();
        if (!pushToken?.data) return;
        await savePatientPushToken(pushToken.data, authToken);
    } catch (error) {
        if (__DEV__) {
            console.warn('[push] patient signup flow failed to sync push token', error);
        }
    }
}

export default function SignupScreen() {
    const navigation = useNavigation<SignupScreenNavigationProp>();
    const { refreshSession } = useAuthSession();
    const insets = useSafeAreaInsets();
    const yearScrollRef = useRef<ScrollView | null>(null);
    const isVeryCompactScreen = Platform.OS === 'android';
    const verificationBoxWidth = isVeryCompactScreen ? 84 : 96;
    const verificationBoxHeight = isVeryCompactScreen ? 52 : 56;
    const verificationFontSize = isVeryCompactScreen ? 24 : 28;

    const [step, setStep] = useState<1 | 2>(1);
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [dob, setDob] = useState('');
    const [gender, setGender] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingPhone, setCheckingPhone] = useState(false);
    const [challengeQuestion, setChallengeQuestion] = useState('');
    const [challengeId, setChallengeId] = useState('');
    const [challengeAnswer, setChallengeAnswer] = useState('');
    const [challengeVerificationToken, setChallengeVerificationToken] = useState('');
    const [challengeVerified, setChallengeVerified] = useState(false);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [verifyingChallenge, setVerifyingChallenge] = useState(false);
    const [challengeStatus, setChallengeStatus] = useState<'idle' | 'success'>('idle');
    const [answerInputActive, setAnswerInputActive] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [showDobCalendar, setShowDobCalendar] = useState(false);
    const [showYearPicker, setShowYearPicker] = useState(false);
    const [dobMonth, setDobMonth] = useState(() => {
        const today = new Date();
        return { year: today.getFullYear(), month: today.getMonth() };
    });

    const canContinue = useMemo(
        () => Boolean(phone.trim() && password.trim() && confirmPassword.trim()),
        [confirmPassword, password, phone]
    );
    const passwordsMatch = useMemo(
        () => Boolean(password.trim() && confirmPassword.trim() && password === confirmPassword),
        [confirmPassword, password]
    );
    const passwordsMismatch = useMemo(
        () => Boolean(confirmPassword.trim() && password !== confirmPassword),
        [confirmPassword, password]
    );
    const computedAge = useMemo(() => calculateAgeFromDob(dob), [dob]);
    const canSubmit = useMemo(
        () =>
            Boolean(
                fullName.trim() &&
                phone.trim() &&
                dob &&
                computedAge != null &&
                gender.trim() &&
                challengeVerified &&
                challengeVerificationToken
            ),
        [challengeVerificationToken, challengeVerified, computedAge, dob, fullName, gender, phone]
    );
    const maxDob = getTodayYMD();
    const selectedDobDate = useMemo(
        () => (dob ? new Date(`${dob}T00:00:00`) : null),
        [dob]
    );
    const selectedYear = useMemo(() => {
        if (selectedDobDate && !Number.isNaN(selectedDobDate.getTime())) {
            return selectedDobDate.getFullYear();
        }
        return dobMonth.year;
    }, [dobMonth.year, selectedDobDate]);

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
            setAnswerInputActive(false);
        } finally {
            setChallengeLoading(false);
        }
    };

    const handleVerifyChallenge = async (answer: string) => {
        if (!challengeId || !answer.trim() || challengeVerified) return;

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
        void loadLoginChallenge();
    }, []);

    useEffect(() => {
        if (challengeVerified) {
            setChallengeVerified(false);
            setChallengeVerificationToken('');
            setChallengeStatus('idle');
        }
    }, [challengeAnswer]);

    useEffect(() => {
        if (!challengeAnswer.trim() || !challengeId || challengeLoading || challengeVerified) return;

        const timer = setTimeout(() => {
            void handleVerifyChallenge(challengeAnswer);
        }, 250);

        return () => clearTimeout(timer);
    }, [challengeAnswer, challengeId, challengeLoading, challengeVerified]);

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
        if (!showYearPicker) return;

        const currentYear = new Date().getFullYear();
        const boundedYear = Math.min(Math.max(selectedYear, 1900), currentYear);
        const yearIndex = boundedYear - 1900;
        const estimatedChipWidth = 74;
        const offset = Math.max(0, yearIndex * estimatedChipWidth - estimatedChipWidth * 2);

        const timer = setTimeout(() => {
            yearScrollRef.current?.scrollTo({ x: offset, animated: false });
        }, 50);

        return () => clearTimeout(timer);
    }, [selectedYear, showYearPicker]);

    const handleContinue = async () => {
        if (!phone.trim()) {
            Alert.alert('Error', 'Please enter phone number');
            return;
        }

        if (!password.trim() || !confirmPassword.trim()) {
            Alert.alert('Error', 'Please enter password and confirm password');
            return;
        }

        if (password.trim().length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Password and confirm password must match');
            return;
        }

        setCheckingPhone(true);
        try {
            const result = await checkPatientSignupAvailability(phone.trim());
            if (result?.exists) {
                Alert.alert(
                    'Account Already Exists',
                    'This phone number is already linked to a patient account.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Go to Login', onPress: () => navigation.replace('Login') },
                    ]
                );
                return;
            }

            setStep(2);
        } catch (error: any) {
            const message =
                error?.response?.data?.error ||
                'Unable to verify this phone number right now. Please try again.';
            Alert.alert('Unable to Continue', message);
        } finally {
            setCheckingPhone(false);
        }
    };

    const handleSignup = async () => {
        setLoading(true);
        try {
            if (!fullName.trim()) {
                Alert.alert('Error', 'Please enter full name');
                return;
            }

            if (!dob || computedAge == null) {
                Alert.alert('Error', 'Please select a valid date of birth');
                return;
            }

            if (!gender.trim()) {
                Alert.alert('Error', 'Please select gender');
                return;
            }

            if (!challengeId || !challengeVerified || !challengeVerificationToken) {
                Alert.alert('Verification Required', 'Please solve and verify the calculation before signing up.');
                return;
            }

            const response = await patientSignup({
                full_name: fullName.trim(),
                phone: phone.trim(),
                password: password.trim(),
                confirmPassword: confirmPassword.trim(),
                age: computedAge,
                gender: gender.trim(),
                challengeId,
                challengeVerificationToken,
            });

            if (!response?.token) {
                Alert.alert('Error', 'Signup failed: Invalid patient session');
                return;
            }

            await setAuthSession(response.token, 'PATIENT');
            await registerPatientPushToken(response.token);
            await refreshSession();
            navigation.replace('PatientMain');
        } catch (error: any) {
            const status = error?.response?.status;
            let message = error?.response?.data?.error || 'Signup failed. Please try again.';

            if (status === 400) {
                setChallengeVerified(false);
                await loadLoginChallenge();
            } else if (status === 409) {
                message = error?.response?.data?.error || 'This phone number is already linked.';
                Alert.alert(
                    'Account Already Exists',
                    message,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Go to Login', onPress: () => navigation.replace('Login') },
                    ]
                );
                return;
            } else if (status === 500) {
                message = 'Server error. Please try again later.';
            } else if (!status) {
                message = 'Network error. Please check your internet connection.';
            }

            Alert.alert('Signup Failed', message);
        } finally {
            setLoading(false);
        }
    };

    const renderDobCalendar = () => {
        const { year, month } = dobMonth;
        const firstDow = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: (number | null)[] = [
            ...Array(firstDow).fill(null),
            ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
        ];

        while (cells.length % 7 !== 0) cells.push(null);

        const prevMonth = () => setDobMonth(({ year: y, month: m }) => {
            if (m === 0) return { year: y - 1, month: 11 };
            return { year: y, month: m - 1 };
        });

        const nextMonth = () => setDobMonth(({ year: y, month: m }) => {
            if (m === 11) return { year: y + 1, month: 0 };
            return { year: y, month: m + 1 };
        });

        const monthName = new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: currentYear - 1900 + 1 }, (_, index) => 1900 + index);

        return (
            <View className="border border-gray-200 rounded-2xl overflow-hidden bg-white mt-3">
                <View className="flex-row items-center justify-between px-4 py-3 bg-blue-50">
                    <TouchableOpacity onPress={prevMonth} className="p-1 rounded-full">
                        <ChevronLeft size={18} color="#1d4ed8" />
                    </TouchableOpacity>
                    <View className="flex-row items-center">
                        <Text className="text-blue-800 font-bold text-sm mr-2">{monthName}</Text>
                        <TouchableOpacity
                            onPress={() => setShowYearPicker((prev) => !prev)}
                            className="px-2.5 py-1 rounded-full bg-white border border-blue-200"
                        >
                            <Text className="text-xs font-bold text-blue-700">{year}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={nextMonth} className="p-1 rounded-full">
                        <ChevronRight size={18} color="#1d4ed8" />
                    </TouchableOpacity>
                </View>

                {showYearPicker ? (
                    <View className="border-b border-gray-100 bg-white px-3 py-3">
                        <ScrollView
                            ref={yearScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingRight: 12 }}
                        >
                            <View className="flex-row">
                                {years.map((optionYear) => {
                                    const isSelectedYear = optionYear === selectedYear;
                                    return (
                                        <TouchableOpacity
                                            key={optionYear}
                                            onPress={() => {
                                                setDobMonth((prev) => ({ ...prev, year: optionYear }));
                                                setShowYearPicker(false);
                                            }}
                                            className={`mr-2 rounded-xl border px-3 py-2 ${
                                                isSelectedYear ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
                                            }`}
                                        >
                                            <Text className={`text-xs font-semibold ${isSelectedYear ? 'text-blue-700' : 'text-gray-700'}`}>
                                                {optionYear}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                ) : null}

                <View className="flex-row bg-gray-50">
                    {DAY_LABELS.map((label) => (
                        <View key={label} className="flex-1 items-center py-1.5">
                            <Text className="text-xs text-gray-400 font-semibold">{label}</Text>
                        </View>
                    ))}
                </View>

                <View className="px-2 pb-3 pt-2">
                    {Array.from({ length: cells.length / 7 }, (_, row) => (
                        <View key={row} className="flex-row">
                            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                                if (!day) return <View key={`${row}-${col}`} className="flex-1 m-1" />;

                                const dateStr = ymdFromParts(year, month + 1, day);
                                const isSelected = dateStr === dob;
                                const isDisabled = dateStr > maxDob;

                                return (
                                    <TouchableOpacity
                                        key={`${row}-${col}`}
                                        onPress={() => {
                                            if (isDisabled) return;
                                            setDob(dateStr);
                                            setShowDobCalendar(false);
                                            setShowYearPicker(false);
                                        }}
                                        disabled={isDisabled}
                                        className={`flex-1 m-1 h-9 items-center justify-center rounded-xl ${
                                            isSelected ? 'bg-blue-600' : 'bg-transparent'
                                        } ${isDisabled ? 'opacity-25' : 'opacity-100'}`}
                                    >
                                        <Text className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                                            {day}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    const authScrollBottomInset = keyboardVisible
        ? Math.max(insets.bottom + 220, 280)
        : Math.max(insets.bottom + 20, 28);

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom', 'left', 'right']}>
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
                    className="bg-gray-50"
                    scrollIndicatorInsets={{ bottom: authScrollBottomInset }}
                >
                    <SafeAreaView edges={['top']} className="bg-blue-700">
                        <Animated.View entering={FadeInDown.duration(600).springify()} className="bg-blue-700 px-6 pt-6 pb-10">
                            <TouchableOpacity
                                onPress={() => navigation.goBack()}
                                className="self-start w-10 h-10 rounded-full bg-white/15 items-center justify-center mb-4"
                                activeOpacity={0.85}
                            >
                                <ArrowLeft size={20} color="#ffffff" />
                            </TouchableOpacity>

                            <View className="rounded-full bg-white items-center justify-center shadow-lg w-20 h-20 mb-4 self-center">
                                <UserPlus size={38} color="#1d4ed8" />
                            </View>

                            <Text className="text-white font-extrabold tracking-wide mb-1 text-center text-[30px]">
                                {step === 1 ? 'Create Account' : 'Complete Profile'}
                            </Text>
                            <Text className="text-blue-200 text-center text-sm">
                                {step === 1
                                    ? 'Sign up with your phone number and password'
                                    : 'Add your details to finish creating your account'}
                            </Text>
                        </Animated.View>
                    </SafeAreaView>

                    <Animated.View
                        entering={FadeInUp.delay(200).duration(500)}
                        className="bg-gray-50 px-6 pt-5 pb-4 -mt-6"
                        style={{ borderTopLeftRadius: 36, borderTopRightRadius: 36 }}
                    >
                        {step === 1 ? (
                            <>
                                <View className="items-center mb-4">
                                    <Text className="font-extrabold text-slate-800 mb-1 text-[28px]">Welcome</Text>
                                    <Text className="text-slate-400 text-center text-sm">
                                        Enter your phone number and create a password
                                    </Text>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Phone Number</Text>
                                    <View className="bg-white rounded-2xl px-4 border-2 border-gray-200 flex-row items-center">
                                        <Phone size={20} color="#64748b" />
                                        <TextInput
                                            className="flex-1 text-gray-800 text-base py-4 px-3"
                                            value={phone}
                                            onChangeText={setPhone}
                                            placeholder="e.g. 9392569600"
                                            placeholderTextColor="#9ca3af"
                                            keyboardType="phone-pad"
                                        />
                                    </View>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Password</Text>
                                    <View className="bg-white rounded-2xl px-4 border-2 border-gray-200 flex-row items-center">
                                        <Lock size={20} color="#64748b" />
                                        <TextInput
                                            className="flex-1 text-gray-800 text-base py-4 px-3"
                                            value={password}
                                            onChangeText={setPassword}
                                            placeholder="Create a password"
                                            placeholderTextColor="#9ca3af"
                                            secureTextEntry={!showPassword}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                                            {showPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Re-enter Password</Text>
                                    <View
                                        className={`bg-white rounded-2xl px-4 border-2 flex-row items-center ${
                                            passwordsMatch ? 'border-emerald-400' : passwordsMismatch ? 'border-red-300' : 'border-gray-200'
                                        }`}
                                    >
                                        <Lock size={20} color="#64748b" />
                                        <TextInput
                                            className="flex-1 text-gray-800 text-base py-4 px-3"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            placeholder="Re-enter your password"
                                            placeholderTextColor="#9ca3af"
                                            secureTextEntry={!showConfirmPassword}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)} hitSlop={8}>
                                            {showConfirmPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={() => {
                                        void handleContinue();
                                    }}
                                    disabled={!canContinue || checkingPhone}
                                    activeOpacity={0.8}
                                    className={`rounded-2xl items-center justify-center py-3.5 mt-2 ${
                                        !canContinue || checkingPhone ? 'bg-blue-300' : 'bg-blue-600'
                                    }`}
                                    style={{
                                        shadowColor: '#1d4ed8',
                                        shadowOffset: { width: 0, height: 6 },
                                        shadowOpacity: 0.4,
                                        shadowRadius: 12,
                                        elevation: 8,
                                    }}
                                >
                                    {checkingPhone ? (
                                        <View className="flex-row items-center">
                                            <ActivityIndicator color="#fff" size="small" />
                                            <Text className="text-white font-bold ml-3 text-lg">Checking...</Text>
                                        </View>
                                    ) : (
                                        <View className="flex-row items-center">
                                            <Text className="text-white font-extrabold mr-2 tracking-wide text-lg">Continue</Text>
                                            <ArrowRight size={20} color="#fff" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View className="items-center mb-4">
                                    <Text className="font-extrabold text-slate-800 mb-1 text-[28px]">Almost There</Text>
                                    <Text className="text-slate-400 text-center text-sm">
                                        Finish your details to create the patient account
                                    </Text>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Full Name</Text>
                                    <View className="bg-white rounded-2xl px-4 border-2 border-gray-200">
                                        <TextInput
                                            className="text-gray-800 text-base py-4"
                                            value={fullName}
                                            onChangeText={setFullName}
                                            placeholder="Your full name"
                                            placeholderTextColor="#9ca3af"
                                        />
                                    </View>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Date of Birth</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setShowDobCalendar(true);
                                            setShowYearPicker(false);
                                        }}
                                        className={`bg-white rounded-2xl px-4 border-2 flex-row items-center justify-between py-4 ${
                                            showDobCalendar ? 'border-blue-500' : 'border-gray-200'
                                        }`}
                                    >
                                        <Text className={`text-base ${dob ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                            {dob ? formatDob(dob) : 'Select date of birth'}
                                        </Text>
                                        <View className="flex-row items-center">
                                            {computedAge != null ? (
                                                <Text className="text-blue-600 font-semibold text-sm mr-2">{computedAge} yrs</Text>
                                            ) : null}
                                            <CalendarDays size={18} color="#2563eb" />
                                        </View>
                                    </TouchableOpacity>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Gender</Text>
                                    <View className="bg-white rounded-2xl px-4 py-3 border-2 border-gray-200">
                                        <View className="flex-row items-center gap-2">
                                            {GENDER_OPTIONS.map((option) => {
                                                const isLongOption = option === 'Prefer not to say';
                                                return (
                                                <TouchableOpacity
                                                    key={option}
                                                    onPress={() => setGender(option)}
                                                    className={`${isLongOption ? 'flex-[1.7]' : 'flex-1'} min-w-0 px-2 py-2 rounded-full border items-center justify-center min-h-[36px] ${
                                                        gender === option ? 'bg-blue-600 border-blue-600' : 'bg-gray-50 border-gray-300'
                                                    }`}
                                                >
                                                    <Text
                                                        className={`text-[10px] font-semibold text-center leading-3 ${gender === option ? 'text-white' : 'text-gray-600'}`}
                                                        numberOfLines={isLongOption ? 2 : 1}
                                                    >
                                                        {option}
                                                    </Text>
                                                </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>

                                <View className="mb-1">
                                    <View className="flex-row items-center justify-between mb-2">
                                        <Text className="text-base font-bold text-gray-700 ml-1">Quick Verification</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                void loadLoginChallenge();
                                            }}
                                            disabled={challengeLoading || verifyingChallenge}
                                            className="flex-row items-center"
                                        >
                                            <RefreshCw size={14} color="#2563eb" />
                                        </TouchableOpacity>
                                    </View>

                                    <View className="bg-white border border-blue-100 rounded-2xl px-4 py-2.5 mb-2">
                                        <View className="flex-row items-center pl-3">
                                            <Calculator size={22} color="#2563eb" />
                                            <View className="flex-1 min-w-0 flex-row items-center ml-4">
                                                {challengeLoading ? (
                                                    <Text className="text-slate-800 font-bold text-2xl mr-2 shrink">Loading...</Text>
                                                ) : challengeQuestion ? (
                                                    <>
                                                        <Text
                                                            className="text-slate-800 font-bold text-[28px] mr-2 shrink"
                                                            numberOfLines={1}
                                                            adjustsFontSizeToFit
                                                            minimumFontScale={0.72}
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
                                                    </>
                                                ) : (
                                                    <Text className="text-slate-800 font-bold text-2xl mr-2 shrink">Unavailable</Text>
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

                                <View className="flex-row items-center gap-3 mt-4">
                                    <TouchableOpacity
                                        onPress={() => setStep(1)}
                                        activeOpacity={0.8}
                                        className="flex-1 rounded-2xl items-center justify-center py-3.5 bg-gray-100"
                                    >
                                        <Text className="text-gray-700 font-bold text-base">Back</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            void handleSignup();
                                        }}
                                        disabled={loading || !canSubmit}
                                        activeOpacity={0.8}
                                        className={`flex-1 rounded-2xl items-center justify-center py-3.5 ${
                                            loading || !canSubmit ? 'bg-blue-300' : 'bg-blue-600'
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
                                                <Text className="text-white font-bold ml-3 text-base">Creating...</Text>
                                            </View>
                                        ) : (
                                            <View className="flex-row items-center">
                                                <Text className="text-white font-extrabold mr-2 tracking-wide text-base">Sign Up</Text>
                                                <ArrowRight size={18} color="#fff" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}

                        <TouchableOpacity onPress={() => navigation.replace('Login')} className="mt-3 self-center" activeOpacity={0.8}>
                            <Text className="text-blue-600 font-semibold">Already have an account? Sign in</Text>
                        </TouchableOpacity>

                        <View className="px-4 mt-3">
                            <View className="flex-row items-center justify-center">
                                <ShieldCheck size={14} color="#9ca3af" />
                                <Text className="text-xs text-gray-400 text-center ml-2">
                                    Your session is encrypted and secure.
                                </Text>
                            </View>
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal
                visible={showDobCalendar}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setShowDobCalendar(false);
                    setShowYearPicker(false);
                }}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-5 max-h-[78%]">
                        <View className="flex-row items-center justify-between mb-4">
                            <View>
                                <Text className="text-xs text-gray-400">Select Date of Birth</Text>
                                <Text className="text-lg font-bold text-gray-800">
                                    {dob ? formatDob(dob) : 'Choose your birth date'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    setShowDobCalendar(false);
                                    setShowYearPicker(false);
                                }}
                                className="bg-gray-100 rounded-full px-3 py-2"
                            >
                                <Text className="text-gray-600 text-xs font-semibold">Close</Text>
                            </TouchableOpacity>
                        </View>

                        <View>{renderDobCalendar()}</View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
