import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    Check,
    ChevronDown,
    ChevronUp,
    Eye,
    EyeOff,
    FileDigit,
    FileText,
    GraduationCap,
    Hash,
    Lock,
    Mail,
    MapPin,
    Phone,
    Plus,
    ShieldCheck,
    Stethoscope,
    Upload,
    User,
    X,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { prepareUploadFile } from '../lib/uploadFilePreparation';

import {
    doctorSignup,
    sendDoctorSignupOtp,
    verifyDoctorSignupOtp,
} from '../api/auth';
import type { DoctorSignupOtpChannel } from '../api/auth';
import { uploadDoctorSignupDocument, uploadDoctorSignupProfilePicture } from '../api/uploads';
import type { RootStackParamList } from '../navigation/types';

type DoctorSignupScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DoctorSignup'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_OTP_LENGTH = 6;
type SignupUploadFile = { uri: string; name: string; mimeType: string };
type SignupVerification = {
    channel: DoctorSignupOtpChannel;
    target: string;
    token: string;
};

function normalizePhoneDigits(value: string) {
    return String(value || '').replace(/\D/g, '');
}

function normalizeUppercaseText(value: string) {
    return String(value || '').toUpperCase();
}

function getTermsAndConditionsUrl() {
    const apiUrl = String(process.env.EXPO_PUBLIC_API_URL || '').trim();
    if (!apiUrl) {
        return 'https://dapto.vinfocom.co.in/terms-and-conditions';
    }

    return apiUrl.replace(/\/api\/?$/i, '') + '/terms-and-conditions';
}

function getPrivacyPolicyUrl() {
    const apiUrl = String(process.env.EXPO_PUBLIC_API_URL || '').trim();
    if (!apiUrl) {
        return 'https://dapto.vinfocom.co.in/privacy-policy';
    }

    return apiUrl.replace(/\/api\/?$/i, '') + '/privacy-policy';
}

function maskEmail(value: string) {
    const [name = '', domain = ''] = String(value || '').split('@');
    if (!name || !domain) return value;
    const visible = name.length <= 2 ? name[0] || '' : name.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

function maskPhone(value: string) {
    const digits = normalizePhoneDigits(value);
    if (digits.length <= 4) return digits || value;
    return `${digits.slice(0, 2)}${'*'.repeat(Math.max(2, digits.length - 4))}${digits.slice(-2)}`;
}

export default function DoctorSignupScreen() {
    const navigation = useNavigation<DoctorSignupScreenNavigationProp>();
    const insets = useSafeAreaInsets();
    const allowedDocumentMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedProfilePicMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
    const otpInputRef = useRef<TextInput | null>(null);
    const addressInputRef = useRef<TextInput | null>(null);
    const [email, setEmail] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [phone, setPhone] = useState('');
    const [numClinics, setNumClinics] = useState(1);
    const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>(['']);
    const [specialization, setSpecialization] = useState('');
    const [registrationNo, setRegistrationNo] = useState('');
    const [education, setEducation] = useState('');
    const [documentUrl, setDocumentUrl] = useState('');
    const [documentMimeType, setDocumentMimeType] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState('');
    const [profilePicMimeType, setProfilePicMimeType] = useState('');
    const [profilePicPreviewLoading, setProfilePicPreviewLoading] = useState(false);
    const [showProfilePreview, setShowProfilePreview] = useState(false);
    const [showDocumentPreview, setShowDocumentPreview] = useState(false);
    const [previewModalLoading, setPreviewModalLoading] = useState(false);
    const [address, setAddress] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [panNumber, setPanNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [emailTouched, setEmailTouched] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploadingDocumentSource, setUploadingDocumentSource] = useState<'camera' | 'file' | null>(null);
    const [uploadingProfilePicSource, setUploadingProfilePicSource] = useState<'camera' | 'file' | null>(null);
    const [signupOtpChannel, setSignupOtpChannel] = useState<DoctorSignupOtpChannel | null>(null);
    const [signupOtpTarget, setSignupOtpTarget] = useState('');
    const [signupOtpValue, setSignupOtpValue] = useState('');
    const [signupOtpInputFocused, setSignupOtpInputFocused] = useState(false);
    const [signupOtpSent, setSignupOtpSent] = useState(false);
    const [signupOtpLoading, setSignupOtpLoading] = useState(false);
    const [signupOtpVerified, setSignupOtpVerified] = useState(false);
    const [signupOtpMessage, setSignupOtpMessage] = useState('');
    const [signupOtpResendCountdown, setSignupOtpResendCountdown] = useState(0);
    const [signupVerification, setSignupVerification] = useState<SignupVerification | null>(null);
    const lastSubmittedSignupOtpRef = useRef('');
    const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
    const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneDigits(phone);
    const hasValidEmail = EMAIL_REGEX.test(normalizedEmail);
    const showEmailFormatError = emailTouched && normalizedEmail.length > 0 && !hasValidEmail;

    const canContinue = useMemo(
        () => Boolean(hasValidEmail && password && confirmPassword && passwordsMatch),
        [confirmPassword, hasValidEmail, password, passwordsMatch]
    );

    const canContinueStep2 = useMemo(
        () => Boolean(doctorName.trim() && normalizedPhone.length === 10),
        [doctorName, normalizedPhone]
    );

    const canContinueStep3 = true;

    const canContinueStep4 = useMemo(
        () =>
            Boolean(
                specialization.trim() &&
                registrationNo.trim()
            ),
        [registrationNo, specialization]
    );

    const canSubmit = useMemo(() => Boolean(address.trim()), [address]);
    const currentSignupOtpTarget = signupOtpChannel === 'EMAIL' ? normalizedEmail : normalizedPhone;
    const isSignupVerificationCurrent = Boolean(
        signupVerification &&
            signupVerification.channel === signupOtpChannel &&
            signupVerification.target === currentSignupOtpTarget
    );
    const canVerifySignupOtp = Boolean(
        signupOtpSent &&
            !signupOtpVerified &&
            !signupOtpLoading &&
            signupOtpValue.trim().length === SIGNUP_OTP_LENGTH
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

    useEffect(() => {
        if (signupOtpResendCountdown <= 0) return;

        const timer = setTimeout(() => {
            setSignupOtpResendCountdown((current) => Math.max(0, current - 1));
        }, 1000);

        return () => clearTimeout(timer);
    }, [signupOtpResendCountdown]);

    useEffect(() => {
        if (!signupVerification) return;

        const verifiedTarget = signupVerification.channel === 'EMAIL' ? normalizedEmail : normalizedPhone;
        if (signupVerification.target === verifiedTarget) return;

        setSignupVerification(null);
        setSignupOtpVerified(false);
        setSignupOtpValue('');
        setSignupOtpMessage('Signup details changed. Please verify again.');
    }, [normalizedEmail, normalizedPhone, signupVerification]);

    useEffect(() => {
        if (!signupOtpChannel || !signupOtpSent || !signupOtpTarget) return;

        const currentTarget = signupOtpChannel === 'EMAIL' ? normalizedEmail : normalizedPhone;
        if (signupOtpTarget === currentTarget) return;

        resetSignupOtpState(true);
        setSignupOtpMessage('Signup details changed. Please request a new OTP.');
    }, [normalizedEmail, normalizedPhone, signupOtpChannel, signupOtpSent, signupOtpTarget]);

    useEffect(() => {
        const currentOtp = signupOtpValue.trim();
        if (
            !signupOtpSent ||
            signupOtpVerified ||
            signupOtpLoading ||
            currentOtp.length !== SIGNUP_OTP_LENGTH ||
            currentOtp === lastSubmittedSignupOtpRef.current
        ) {
            return;
        }

        lastSubmittedSignupOtpRef.current = currentOtp;
        void handleVerifySignupOtp(currentOtp);
    }, [signupOtpSent, signupOtpValue, signupOtpVerified, signupOtpLoading]);

    useEffect(() => {
        if (step !== 5) return;

        const focusTimer = setTimeout(() => {
            addressInputRef.current?.focus();
        }, 120);

        return () => clearTimeout(focusTimer);
    }, [step]);

    const resetSignupOtpState = (keepChannel = false) => {
        if (!keepChannel) setSignupOtpChannel(null);
        setSignupOtpTarget('');
        setSignupOtpValue('');
        setSignupOtpInputFocused(false);
        lastSubmittedSignupOtpRef.current = '';
        setSignupOtpSent(false);
        setSignupOtpLoading(false);
        setSignupOtpVerified(false);
        setSignupOtpMessage('');
        setSignupOtpResendCountdown(0);
        setSignupVerification(null);
    };

    const getSignupOtpTarget = (channel: DoctorSignupOtpChannel) => {
        return channel === 'EMAIL' ? normalizedEmail : normalizedPhone;
    };

    const getSignupOtpDisplayTarget = (channel: DoctorSignupOtpChannel) => {
        return channel === 'EMAIL' ? maskEmail(normalizedEmail) : maskPhone(normalizedPhone);
    };

    const handleOpenTermsAndConditions = async () => {
        const url = getTermsAndConditionsUrl();

        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert('Unable to Open', 'Terms & Conditions link is not available right now.');
                return;
            }

            await Linking.openURL(url);
        } catch {
            Alert.alert('Unable to Open', 'Terms & Conditions link is not available right now.');
        }
    };

    const handleOpenPrivacyPolicy = async () => {
        const url = getPrivacyPolicyUrl();

        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert('Unable to Open', 'Privacy Policy link is not available right now.');
                return;
            }

            await Linking.openURL(url);
        } catch {
            Alert.alert('Unable to Open', 'Privacy Policy link is not available right now.');
        }
    };

    const focusSignupOtpInput = () => {
        setSignupOtpInputFocused(true);
        otpInputRef.current?.blur();
        setTimeout(() => {
            otpInputRef.current?.focus();
        }, 40);
    };

    const handleSendSignupOtp = async (channel: DoctorSignupOtpChannel) => {
        const target = getSignupOtpTarget(channel);
        if (!target) {
            Alert.alert('Error', channel === 'EMAIL' ? 'Please enter a valid email address' : 'Please enter phone number');
            return;
        }

        if (channel === 'EMAIL' && !hasValidEmail) {
            Alert.alert('Error', 'Please enter a valid email address');
            return;
        }

        setSignupOtpChannel(channel);
        setSignupOtpLoading(true);
        setSignupOtpValue('');
        lastSubmittedSignupOtpRef.current = '';
        setSignupOtpVerified(false);
        setSignupVerification(null);
        setSignupOtpMessage(channel === 'EMAIL' ? 'Sending OTP to email...' : 'Sending OTP to phone...');

        try {
            const response = await sendDoctorSignupOtp(channel, target, {
                email: normalizedEmail,
                phone: normalizedPhone,
            });
            setSignupOtpSent(true);
            setSignupOtpTarget(target);
            setSignupOtpResendCountdown(Number(response?.resendAfterSeconds || 30));
            setSignupOtpMessage(
                channel === 'EMAIL'
                    ? 'OTP sent to your email. Check spam or promotions if it is not in your inbox.'
                    : 'OTP sent to your phone. Enter it below to continue.'
            );
            setTimeout(focusSignupOtpInput, 120);
        } catch (error: any) {
            const status = error?.response?.status;
            const resendAfterSeconds = Number(error?.response?.data?.resendAfterSeconds || 0);
            if (status === 429 && resendAfterSeconds > 0) {
                setSignupOtpSent(true);
                setSignupOtpTarget(target);
                setSignupOtpResendCountdown(resendAfterSeconds);
            }
            const message = error?.response?.data?.error || 'Unable to send OTP right now.';
            setSignupOtpMessage(message);
            Alert.alert('Unable to Send OTP', message);
        } finally {
            setSignupOtpLoading(false);
        }
    };

    const handleVerifySignupOtp = async (providedOtp?: string) => {
        if (!signupOtpChannel) return;
        const target = getSignupOtpTarget(signupOtpChannel);
        const otp = String(providedOtp || signupOtpValue).trim();
        if (!target || otp.length !== SIGNUP_OTP_LENGTH) return;

        setSignupOtpLoading(true);
        setSignupOtpMessage('Verifying OTP...');
        try {
            const response = await verifyDoctorSignupOtp(signupOtpChannel, target, otp);
            const token = String(response?.verificationToken || '');
            if (!token) {
                throw new Error('Verification token missing');
            }
            setSignupVerification({ channel: signupOtpChannel, target, token });
            setSignupOtpVerified(true);
            setSignupOtpMessage('OTP verified successfully.');
        } catch (error: any) {
            setSignupOtpVerified(false);
            const message = error?.response?.data?.error || error?.message || 'Unable to verify OTP.';
            setSignupOtpMessage(message);
            if (/invalid otp/i.test(message)) {
                setSignupOtpMessage('Invalid OTP. Please try again.');
            } else {
                Alert.alert('OTP Verification Failed', message);
            }
        } finally {
            setSignupOtpLoading(false);
        }
    };

    const handleContinue = () => {
        if (!normalizedEmail) {
            Alert.alert('Error', 'Please enter email address');
            return;
        }

        if (!hasValidEmail) {
            Alert.alert('Error', 'Please enter a valid email address');
            return;
        }

        if (!password || password.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Password and re-entered password must match');
            return;
        }

        setStep(2);
    };

    const handleSignup = async () => {
        setLoading(true);
        try {
            if (!doctorName.trim()) {
                Alert.alert('Error', 'Please enter doctor name');
                return;
            }

            if (!normalizedEmail || !hasValidEmail) {
                Alert.alert('Error', 'Please enter a valid email address');
                return;
            }

            const primaryWhatsappNumber = whatsappNumbers.find((value) => value.trim())?.trim() || '';

            if (!specialization.trim() || !registrationNo.trim() || !address.trim()) {
                Alert.alert('Error', 'Please fill all mandatory doctor details');
                return;
            }

            if (!password || password.length < 6) {
                Alert.alert('Error', 'Password must be at least 6 characters');
                return;
            }

            if (password !== confirmPassword) {
                Alert.alert('Error', 'Password and re-entered password must match');
                return;
            }

            if (!signupVerification || !isSignupVerificationCurrent) {
                Alert.alert('Verification Required', 'Please verify your email or phone number before submitting.');
                setStep(6);
                return;
            }

            const response = await doctorSignup({
                email: normalizedEmail,
                password,
                confirmPassword,
                doctor_name: doctorName.trim(),
                phone: normalizedPhone,
                num_clinics: numClinics,
                whatsapp_number: primaryWhatsappNumber,
                whatsapp_numbers: whatsappNumbers.map((value) => value.trim()).filter(Boolean),
                specialization: specialization.trim(),
                registration_no: normalizeUppercaseText(registrationNo).trim(),
                education: normalizeUppercaseText(education).trim(),
                document_url: documentUrl.trim(),
                profile_pic_url: profilePicUrl.trim(),
                address: address.trim(),
                gst_number: gstNumber.trim(),
                pan_number: panNumber.trim(),
                verificationChannel: signupVerification.channel,
                verificationTarget: signupVerification.target,
                verificationToken: signupVerification.token,
            });

            if (!response?.review_required) {
                Alert.alert('Error', 'Profile submission failed. Please try again.');
                return;
            }

            Alert.alert('Profile Submitted', 'Thank you, Doctor. Your profile has been submitted and will be reviewed shortly.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('Login'),
                },
            ]);
        } catch (error: any) {
            const status = error?.response?.status;
            let message = error?.response?.data?.error || 'Signup failed. Please try again.';

            if (status === 409) {
                message = error?.response?.data?.error || 'This email is already in use.';
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

    const uploadSignupDocument = async (file: SignupUploadFile) => {
        if (!allowedDocumentMimeTypes.includes(file.mimeType)) {
            setUploadingDocumentSource(null);
            Alert.alert('Unsupported File', 'Only PDF, JPG, PNG, and WEBP files are allowed.');
            return;
        }

        try {
            const uploaded = await uploadDoctorSignupDocument({
                uri: file.uri,
                name: file.name,
                mimeType: file.mimeType,
            });
            setDocumentUrl(uploaded.url);
            setDocumentMimeType(uploaded.mimeType || file.mimeType);
        } catch (error: any) {
            Alert.alert('Upload Failed', error?.message || 'Unable to upload degree document.');
        } finally {
            setUploadingDocumentSource(null);
        }
    };

    const uploadSignupProfilePicture = async (file: SignupUploadFile) => {
        if (!allowedProfilePicMimeTypes.includes(file.mimeType)) {
            setUploadingProfilePicSource(null);
            Alert.alert('Unsupported File', 'Only JPG, PNG, and WEBP files are allowed.');
            return;
        }

        try {
            const uploaded = await uploadDoctorSignupProfilePicture({
                uri: file.uri,
                name: file.name,
                mimeType: file.mimeType,
            });
            setProfilePicUrl(uploaded.url);
            setProfilePicMimeType(uploaded.mimeType || file.mimeType);
            setProfilePicPreviewLoading(true);
        } catch (error: any) {
            Alert.alert('Upload Failed', error?.message || 'Unable to upload profile picture.');
        } finally {
            setUploadingProfilePicSource(null);
        }
    };

    const handleDocumentCamera = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission Required', 'Please allow camera access to capture your degree document.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
        });

        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        const file = await prepareUploadFile(asset, {
            fallbackBaseName: `degree-${Date.now()}`,
            fallbackMimeType: 'image/jpeg',
            optimizeImage: true,
            maxLongEdgePx: 1600,
            jpegQuality: 0.72,
        });
        setUploadingDocumentSource('camera');
        await uploadSignupDocument({
            uri: file.uri,
            name: file.name,
            mimeType: file.mimeType,
        });
    };

    const handleDocumentFile = async () => {
        const result = await DocumentPicker.getDocumentAsync({
            type: allowedDocumentMimeTypes,
            copyToCacheDirectory: true,
            multiple: false,
        });

        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        setUploadingDocumentSource('file');
        await uploadSignupDocument({
            uri: asset.uri,
            name: asset.name || `degree-${Date.now()}.pdf`,
            mimeType: asset.mimeType || 'application/pdf',
        });
    };

    const handleProfilePictureCamera = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Permission Required', 'Please allow camera access to capture your profile picture.');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
        });

        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        const file = await prepareUploadFile(asset, {
            fallbackBaseName: `profile-${Date.now()}`,
            fallbackMimeType: 'image/jpeg',
            optimizeImage: true,
            maxLongEdgePx: 1600,
            jpegQuality: 0.72,
        });
        setUploadingProfilePicSource('camera');
        await uploadSignupProfilePicture({
            uri: file.uri,
            name: file.name,
            mimeType: file.mimeType,
        });
    };

    const handleProfilePictureFile = async () => {
        const result = await DocumentPicker.getDocumentAsync({
            type: allowedProfilePicMimeTypes,
            copyToCacheDirectory: true,
            multiple: false,
        });

        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        setUploadingProfilePicSource('file');
        await uploadSignupProfilePicture({
            uri: asset.uri,
            name: asset.name || `profile-${Date.now()}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
        });
    };

    const openUploadedDocument = async () => {
        if (!documentUrl) {
            Alert.alert('No Document', 'Please upload your education or degree proof first.');
            return;
        }

        setPreviewModalLoading(true);
        setShowDocumentPreview(true);
    };

    const openUploadedProfilePicture = async () => {
        if (!profilePicUrl) return;

        setPreviewModalLoading(true);
        setShowProfilePreview(true);
    };

    const clearUploadedDocument = () => {
        setDocumentUrl('');
        setDocumentMimeType('');
    };

    const clearUploadedProfilePicture = () => {
        setProfilePicUrl('');
        setProfilePicMimeType('');
        setProfilePicPreviewLoading(false);
    };

    const renderInput = (
        label: string,
        value: string,
        onChangeText: (text: string) => void,
        placeholder: string,
        icon?: React.ReactNode,
        keyboardType: 'default' | 'email-address' | 'phone-pad' = 'default',
        helperText?: string,
        options?: {
            autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
            maxLength?: number;
            inputRef?: React.RefObject<TextInput | null>;
        }
    ) => (
        <View className="mb-3">
            <Text className="text-base font-bold text-gray-700 mb-2 ml-1">{label}</Text>
            <View className="flex-row items-center bg-white rounded-2xl px-4 border-2 border-gray-200">
                {icon}
                <TextInput
                    ref={options?.inputRef}
                    className="flex-1 px-3 text-base text-slate-800 py-4"
                    placeholder={placeholder}
                    placeholderTextColor="#9ca3af"
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                    autoCapitalize={options?.autoCapitalize ?? 'none'}
                    maxLength={options?.maxLength}
                />
            </View>
            {helperText ? <Text className="mt-1 ml-1 text-xs text-slate-500">{helperText}</Text> : null}
        </View>
    );

    const renderContinueBackButtons = ({
        onBack,
        onContinue,
        continueDisabled,
        continueLabel = 'Continue',
        continueLoading = false,
    }: {
        onBack: () => void;
        onContinue: () => void;
        continueDisabled: boolean;
        continueLabel?: string;
        continueLoading?: boolean;
    }) => (
        <View className="flex-row items-center gap-3 mt-4">
            <TouchableOpacity
                onPress={onBack}
                activeOpacity={0.8}
                className="min-w-[96px] rounded-2xl items-center justify-center py-3.5 px-4 bg-gray-100"
            >
                <Text className="text-gray-700 font-bold text-base">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onContinue}
                disabled={continueDisabled}
                activeOpacity={0.8}
                className={`flex-[1.55] rounded-2xl items-center justify-center py-3.5 px-3 ${
                    continueDisabled ? 'bg-blue-300' : 'bg-blue-600'
                }`}
                style={{
                    shadowColor: '#1d4ed8',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.4,
                    shadowRadius: 12,
                    elevation: 8,
                }}
            >
                {continueLoading ? (
                    <View className="flex-row items-center">
                        <ActivityIndicator color="#fff" size="small" />
                        <Text className="text-white font-bold ml-3 text-base">Creating...</Text>
                    </View>
                ) : (
                    <View className="flex-row items-center justify-center">
                        <Text
                            className="text-white font-extrabold mr-2 text-base text-center flex-shrink"
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                        >
                            {continueLabel}
                        </Text>
                        <ArrowRight size={18} color="#fff" />
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );

    const renderSignupOtpOption = (
        channel: DoctorSignupOtpChannel,
        title: string,
        target: string,
        icon: React.ReactNode
    ) => {
        const isSelected = signupOtpChannel === channel;
        const isSendingThisMethod = signupOtpLoading && isSelected && !signupOtpSent;
        return (
            <TouchableOpacity
                onPress={() => {
                    void handleSendSignupOtp(channel);
                }}
                disabled={signupOtpLoading}
                activeOpacity={0.88}
                className={`rounded-[26px] border px-4 py-4 bg-white ${
                    isSelected ? 'border-blue-400' : 'border-slate-200'
                }`}
            >
                <View className="flex-row items-center">
                    <View className={`mr-3 h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? 'bg-blue-600' : 'bg-blue-50'}`}>
                        {icon}
                    </View>
                    <View className="flex-1">
                        <Text className="text-base font-extrabold text-slate-800">{title}</Text>
                        <Text className="mt-1 text-sm text-slate-500">{target}</Text>
                    </View>
                    <View className="min-w-[82px] flex-row items-center justify-center rounded-2xl bg-blue-50 px-3 py-2">
                        {isSendingThisMethod ? (
                            <ActivityIndicator size="small" color="#2563eb" />
                        ) : (
                            <Text className="text-xs font-bold text-blue-700">Send OTP</Text>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderSignupOtpBoxes = () => (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={focusSignupOtpInput}
            className="flex-row items-center justify-between"
        >
            {Array.from({ length: SIGNUP_OTP_LENGTH }).map((_, index) => {
                const digit = signupOtpValue[index] ?? '';
                const isActive =
                    !signupOtpVerified &&
                    signupOtpInputFocused &&
                    (index === signupOtpValue.length ||
                        (signupOtpValue.length === SIGNUP_OTP_LENGTH && index === SIGNUP_OTP_LENGTH - 1));
                return (
                    <View
                        key={index}
                        className={`h-14 rounded-2xl border-2 items-center justify-center ${
                            signupOtpVerified
                                ? 'bg-emerald-50 border-emerald-300'
                                : isActive
                                    ? 'bg-white border-blue-500'
                                    : digit
                                    ? 'bg-white border-blue-300'
                                    : 'bg-slate-50 border-slate-200'
                        }`}
                        style={{ width: 44 }}
                    >
                        {digit ? (
                            <Text className="text-xl font-extrabold text-slate-800">{digit}</Text>
                        ) : isActive ? (
                            <View className="h-6 w-[2px] rounded-full bg-blue-500" />
                        ) : (
                            <Text className="text-xl font-extrabold text-slate-300">*</Text>
                        )}
                    </View>
                );
            })}
        </TouchableOpacity>
    );

    const renderVerificationStep = () => {
        const selectedTarget = signupOtpChannel ? getSignupOtpDisplayTarget(signupOtpChannel) : '';
        const showMethodPicker = !signupOtpChannel || !signupOtpSent;
        const signupOtpInvalid = /invalid otp/i.test(signupOtpMessage);

        return (
            <>
                <View className="mb-4 rounded-[28px] border border-blue-100 bg-white px-4 py-5">
                    <View className="mb-4 flex-row items-center">
                        <View className="mr-3 h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                            <ShieldCheck size={24} color="#2563eb" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-xl font-extrabold text-slate-900">Verify Account</Text>
                            <Text className="mt-1 text-sm leading-5 text-slate-500">
                                Choose one method to verify your doctor account.
                            </Text>
                        </View>
                    </View>

                    {showMethodPicker ? (
                        <View>
                            {renderSignupOtpOption(
                                'EMAIL',
                                'Email',
                                maskEmail(normalizedEmail),
                                <Mail size={21} color={signupOtpChannel === 'EMAIL' ? '#ffffff' : '#2563eb'} />
                            )}

                            <View className="my-3 flex-row items-center">
                                <View className="h-px flex-1 bg-slate-200" />
                                <Text className="mx-3 text-xs font-bold text-slate-400">OR</Text>
                                <View className="h-px flex-1 bg-slate-200" />
                            </View>

                            {renderSignupOtpOption(
                                'PHONE',
                                'Phone',
                                maskPhone(normalizedPhone),
                                <Phone size={21} color={signupOtpChannel === 'PHONE' ? '#ffffff' : '#2563eb'} />
                            )}
                        </View>
                    ) : (
                        <View>
                            <View className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                                <View className="flex-row items-center">
                                    <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-white">
                                        {signupOtpChannel === 'EMAIL' ? <Mail size={19} color="#2563eb" /> : <Phone size={19} color="#2563eb" />}
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-sm font-bold text-slate-800">OTP sent to</Text>
                                        <Text className="mt-0.5 text-sm text-slate-500">{selectedTarget}</Text>
                                    </View>
                                </View>
                                {signupOtpMessage && !signupOtpInvalid ? (
                                    <Text className="mt-3 text-xs leading-5 text-blue-900">{signupOtpMessage}</Text>
                                ) : null}
                            </View>

                            <View className="mt-5 rounded-[24px] border border-slate-200 bg-white px-4 py-5">
                                <Text className="mb-2 text-lg font-extrabold text-slate-800">Enter OTP</Text>
                                <Text className="mb-4 text-sm text-slate-500">{`Enter the ${SIGNUP_OTP_LENGTH}-digit code.`}</Text>

                                {renderSignupOtpBoxes()}

                                {signupOtpInvalid ? (
                                    <View className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                                        <Text className="text-sm font-semibold text-red-700">Invalid OTP. Please try again.</Text>
                                    </View>
                                ) : null}

                                <TextInput
                                    ref={otpInputRef}
                                    value={signupOtpValue}
                                    onChangeText={(text) => {
                                        const nextValue = text.replace(/\D/g, '').slice(0, SIGNUP_OTP_LENGTH);
                                        setSignupOtpValue(nextValue);
                                        if (nextValue.length < SIGNUP_OTP_LENGTH) {
                                            lastSubmittedSignupOtpRef.current = '';
                                        }
                                        if (signupOtpVerified) {
                                            setSignupOtpVerified(false);
                                            setSignupVerification(null);
                                        }
                                    }}
                                    keyboardType="number-pad"
                                    maxLength={SIGNUP_OTP_LENGTH}
                                    editable={!signupOtpVerified}
                                    caretHidden
                                    showSoftInputOnFocus
                                    autoFocus
                                    onFocus={() => setSignupOtpInputFocused(true)}
                                    onBlur={() => setSignupOtpInputFocused(false)}
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

                                {!signupOtpVerified ? (
                                    <TouchableOpacity
                                        onPress={() => {
                                            void handleVerifySignupOtp();
                                        }}
                                        disabled={!canVerifySignupOtp}
                                        activeOpacity={0.85}
                                        className={`mt-5 flex-row items-center justify-center rounded-2xl py-4 ${
                                            canVerifySignupOtp ? 'bg-blue-600' : 'bg-blue-300'
                                        }`}
                                    >
                                        {signupOtpLoading ? (
                                            <View className="flex-row items-center">
                                                <ActivityIndicator size="small" color="#ffffff" />
                                                <Text className="ml-3 text-base font-bold text-white">Verifying OTP...</Text>
                                            </View>
                                        ) : (
                                            <>
                                                <Text className="mr-2 text-base font-extrabold text-white">Verify OTP</Text>
                                                <ArrowRight size={19} color="#ffffff" />
                                            </>
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    <View className="mt-5 flex-row items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                        <Animated.View entering={ZoomIn.duration(220)} className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-emerald-500">
                                            <Check size={18} color="#ffffff" />
                                        </Animated.View>
                                        <View className="flex-1">
                                            <Text className="font-semibold text-emerald-700">Verified successfully.</Text>
                                            <Text className="mt-1 text-xs text-emerald-600">Your account is ready to submit for review.</Text>
                                        </View>
                                    </View>
                                )}

                                <View className="mt-4 flex-row items-center justify-between">
                                    <Text className="text-sm text-slate-500">
                                        {signupOtpResendCountdown > 0 ? `Resend in ${signupOtpResendCountdown}s` : "Didn't receive the OTP?"}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (signupOtpChannel) void handleSendSignupOtp(signupOtpChannel);
                                        }}
                                        disabled={signupOtpLoading || signupOtpResendCountdown > 0}
                                        activeOpacity={0.85}
                                    >
                                        <Text className={`font-semibold ${signupOtpLoading || signupOtpResendCountdown > 0 ? 'text-slate-400' : 'text-blue-600'}`}>
                                            Resend OTP
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    onPress={() => resetSignupOtpState()}
                                    disabled={signupOtpLoading}
                                    activeOpacity={0.85}
                                    className="mt-4 items-center rounded-2xl bg-slate-100 py-3"
                                >
                                    <Text className="font-semibold text-slate-700">Change method</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                <View className="mb-3 px-1">
                    <Text className="text-center text-xs leading-5 text-slate-500">
                        By submitting, you agree to{' '}
                        <Text className="font-semibold text-blue-600" onPress={() => void handleOpenTermsAndConditions()}>
                            Terms &amp; Conditions
                        </Text>
                        {'\n'}
                        and acknowledge that you have read our{' '}
                        <Text className="font-semibold text-blue-600" onPress={() => void handleOpenPrivacyPolicy()}>
                            Privacy Policy
                        </Text>
                        .
                    </Text>
                </View>

                {renderContinueBackButtons({
                    onBack: () => setStep(5),
                    onContinue: handleSignup,
                    continueDisabled: loading || !isSignupVerificationCurrent,
                    continueLabel: 'Submit',
                    continueLoading: loading,
                })}
            </>
        );
    };

    const renderPreviewModal = ({
        visible,
        title,
        url,
        mimeType,
        onClose,
    }: {
        visible: boolean;
        title: string;
        url: string;
        mimeType: string;
        onClose: () => void;
    }) => {
        const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(url);

        return (
            <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
                <View className="flex-1 bg-black/80 px-5 py-8 justify-center">
                    <View className="bg-white rounded-[26px] overflow-hidden max-h-[86%]">
                        <View className="flex-row items-center justify-between bg-blue-600 px-4 py-3">
                            <Text className="text-white font-extrabold text-base">{title}</Text>
                            <TouchableOpacity
                                onPress={onClose}
                                activeOpacity={0.85}
                                className="h-8 w-8 rounded-full bg-white/15 items-center justify-center"
                            >
                                <X size={16} color="#ffffff" />
                            </TouchableOpacity>
                        </View>

                        <View className="bg-slate-950 items-center justify-center relative">
                            {isImage ? (
                                <Image
                                    source={{ uri: url }}
                                    className="w-full h-[420px]"
                                    resizeMode="contain"
                                    onLoadStart={() => setPreviewModalLoading(true)}
                                    onLoadEnd={() => setPreviewModalLoading(false)}
                                    onError={() => setPreviewModalLoading(false)}
                                />
                            ) : (
                                <View className="w-full h-[320px] items-center justify-center px-6">
                                    <FileText size={42} color="#ffffff" />
                                    <Text className="text-white font-bold text-lg mt-4 text-center">Document uploaded</Text>
                                    <Text className="text-slate-300 text-sm mt-2 text-center">
                                        Preview is available for image documents. This file is attached for signup.
                                    </Text>
                                </View>
                            )}
                            {isImage && previewModalLoading ? (
                                <View className="absolute inset-0 items-center justify-center bg-black/20">
                                    <ActivityIndicator size="large" color="#ffffff" />
                                </View>
                            ) : null}
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    const signupScrollBottomInset = keyboardVisible
        ? Math.max(insets.bottom + 220, 280)
        : Math.max(insets.bottom + 24, 32);

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: signupScrollBottomInset }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    showsVerticalScrollIndicator={false}
                    scrollIndicatorInsets={{ bottom: signupScrollBottomInset }}
                    className="bg-gray-50"
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
                                <Stethoscope size={38} color="#1d4ed8" />
                            </View>

                            <Text className="text-white font-extrabold tracking-wide mb-1 text-center text-[30px]">
                                Doctor Signup
                            </Text>
                            <Text className="text-blue-200 text-center text-sm">
                                Create your doctor account and complete all mandatory profile details
                            </Text>
                        </Animated.View>
                    </SafeAreaView>

                    <Animated.View
                        entering={FadeInUp.delay(200).duration(500)}
                        className="bg-gray-50 px-6 pt-5 pb-4 -mt-6"
                        style={{ borderTopLeftRadius: 36, borderTopRightRadius: 36 }}
                    >
                        <View className="items-center mb-4">
                            <View className="rounded-full bg-blue-50 px-3 py-1 mb-2">
                                <Text className="text-xs font-bold text-blue-700">{`Step ${step} of 6`}</Text>
                            </View>
                            <Text className="font-extrabold text-slate-800 mb-1 text-[28px]">
                                {step === 6 ? 'Verify Account' : 'Create Account'}
                            </Text>
                        </View>

                        {step === 1 ? (
                            <>
                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Email Address</Text>
                                    <View
                                        className={`flex-row items-center bg-white rounded-2xl px-4 border-2 ${
                                            showEmailFormatError ? 'border-red-300' : 'border-gray-200'
                                        }`}
                                    >
                                        <Mail size={20} color={showEmailFormatError ? '#ef4444' : '#64748b'} />
                                        <TextInput
                                            className="flex-1 px-3 text-base text-slate-800 py-4"
                                            placeholder="doctor@example.com"
                                            placeholderTextColor="#9ca3af"
                                            value={email}
                                            onChangeText={(text) => {
                                                setEmail(text);
                                            }}
                                            onBlur={() => setEmailTouched(true)}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                    </View>
                                    {showEmailFormatError ? (
                                        <Text className="text-sm text-red-500 mt-2 ml-1">Fill valid email</Text>
                                    ) : null}
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Password</Text>
                                    <View className="flex-row items-center bg-white rounded-2xl px-4 border-2 border-gray-200">
                                        <Lock size={20} color="#64748b" />
                                        <TextInput
                                            className="flex-1 px-3 text-base text-slate-800 py-4"
                                            placeholder="Enter password"
                                            placeholderTextColor="#9ca3af"
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={!showPassword}
                                        />
                                        <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)} className="p-2">
                                            {showPassword ? <EyeOff size={22} color="#64748b" /> : <Eye size={22} color="#64748b" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View className="mb-3">
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">Re-enter Password</Text>
                                    <View
                                        className={`flex-row items-center bg-white rounded-2xl px-4 border-2 ${
                                            passwordsMatch ? 'border-emerald-400' : passwordsMismatch ? 'border-red-300' : 'border-gray-200'
                                        }`}
                                    >
                                        <Lock size={20} color="#64748b" />
                                        <TextInput
                                            className="flex-1 px-3 text-base text-slate-800 py-4"
                                            placeholder="Re-enter password"
                                            placeholderTextColor="#9ca3af"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            secureTextEntry={!showConfirmPassword}
                                        />
                                        <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)} className="p-2">
                                            {showConfirmPassword ? <EyeOff size={22} color="#64748b" /> : <Eye size={22} color="#64748b" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {renderContinueBackButtons({
                                    onBack: () => navigation.goBack(),
                                    onContinue: handleContinue,
                                    continueDisabled: loading || !canContinue,
                                })}
                            </>
                        ) : step === 2 ? (
                            <>
                                {renderInput('Doctor Name', doctorName, setDoctorName, 'Your Name', <User size={20} color="#64748b" />)}
                                {renderInput(
                                    'Appointment Phone Number',
                                    phone,
                                    (text) => setPhone(normalizePhoneDigits(text).slice(0, 10)),
                                    '9876543210',
                                    <Phone size={20} color="#64748b" />,
                                    'phone-pad',
                                    undefined,
                                    { maxLength: 10 }
                                )}

                                <View className="mb-4 overflow-hidden rounded-[26px] border border-blue-100 bg-white">
                                    <View className="bg-blue-600 px-4 py-3">
                                        <Text className="text-white text-base font-extrabold">Profile Picture</Text>
                                        <Text className="mt-1 text-xs text-blue-100">Optional</Text>
                                    </View>

                                    <View className="px-4 py-4">
                                        <View className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 py-4">
                                            <View className="flex-row items-start">
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        void openUploadedProfilePicture();
                                                    }}
                                                    disabled={!profilePicUrl}
                                                    activeOpacity={0.85}
                                                    className="mr-3 mt-0.5 h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white"
                                                >
                                                    {profilePicUrl ? (
                                                        <>
                                                            {profilePicPreviewLoading ? (
                                                                <ActivityIndicator size="small" color="#2563eb" />
                                                            ) : null}
                                                            <Image
                                                                source={{ uri: profilePicUrl }}
                                                                className={`h-14 w-14 ${profilePicPreviewLoading ? 'absolute opacity-0' : ''}`}
                                                                resizeMode="cover"
                                                                onLoadStart={() => setProfilePicPreviewLoading(true)}
                                                                onLoadEnd={() => setProfilePicPreviewLoading(false)}
                                                                onError={() => setProfilePicPreviewLoading(false)}
                                                            />
                                                        </>
                                                    ) : (
                                                        <User size={20} color="#2563eb" />
                                                    )}
                                                </TouchableOpacity>
                                                <View className="flex-1">
                                                    <Text className="text-base font-bold text-slate-800">
                                                        {profilePicUrl ? 'Uploaded' : 'Add profile picture'}
                                                    </Text>
                                                    {!profilePicUrl ? (
                                                        <Text className="mt-1 text-xs leading-5 text-slate-500">
                                                            JPG, PNG, WEBP. Max 10 MB.
                                                        </Text>
                                                    ) : null}
                                                    {profilePicUrl && profilePicMimeType ? (
                                                        <Text className="mt-2 text-[11px] font-semibold text-blue-700">
                                                            {profilePicMimeType.toUpperCase()}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                                {profilePicUrl ? (
                                                    <TouchableOpacity
                                                        onPress={clearUploadedProfilePicture}
                                                        activeOpacity={0.85}
                                                        className="ml-3 h-8 w-8 items-center justify-center rounded-full bg-white"
                                                    >
                                                        <X size={14} color="#64748b" />
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>

                                            <View className="mt-4 flex-row items-center gap-3">
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        void handleProfilePictureCamera();
                                                    }}
                                                    disabled={uploadingProfilePicSource !== null}
                                                    activeOpacity={0.85}
                                                    className="flex-1 flex-row items-center justify-center rounded-2xl bg-white py-3"
                                                >
                                                    {uploadingProfilePicSource === 'camera' ? <ActivityIndicator size="small" color="#2563eb" /> : <Camera size={16} color="#2563eb" />}
                                                    <Text className="ml-2 text-sm font-bold text-blue-700">Camera</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    onPress={() => {
                                                        void handleProfilePictureFile();
                                                    }}
                                                    disabled={uploadingProfilePicSource !== null}
                                                    activeOpacity={0.85}
                                                    className="flex-1 flex-row items-center justify-center rounded-2xl bg-blue-600 py-3"
                                                >
                                                    {uploadingProfilePicSource === 'file' ? <ActivityIndicator size="small" color="#ffffff" /> : <Upload size={16} color="#ffffff" />}
                                                    <Text className="ml-2 text-sm font-bold text-white">Files</Text>
                                                </TouchableOpacity>
                                            </View>

                                        </View>
                                    </View>
                                </View>

                                {renderContinueBackButtons({
                                    onBack: () => setStep(1),
                                    onContinue: () => setStep(3),
                                    continueDisabled: !canContinueStep2,
                                })}
                            </>
                        ) : step === 3 ? (
                            <>
                                <View className="mb-3">
                                    <View className="mb-2 ml-1 flex-row items-center justify-between">
                                        <Text className="text-base font-bold text-gray-700">WhatsApp Number</Text>
                                        <Text className="text-[11px] text-gray-500">Optional</Text>
                                    </View>
                                    {whatsappNumbers.map((value, index) => (
                                        <View key={index} className="mb-2 flex-row items-center">
                                            <View className="flex-1 flex-row items-center bg-white rounded-2xl px-4 border-2 border-gray-200">
                                                <Phone size={20} color="#64748b" />
                                                <TextInput
                                                    className="flex-1 px-3 text-base text-slate-800 py-4"
                                                    placeholder="9876543210"
                                                    placeholderTextColor="#9ca3af"
                                                    value={value}
                                                    onChangeText={(text) => {
                                                        const normalizedValue = normalizePhoneDigits(text).slice(0, 10);
                                                        setWhatsappNumbers((prev) =>
                                                            prev.map((item, itemIndex) => (itemIndex === index ? normalizedValue : item))
                                                        );
                                                    }}
                                                    keyboardType="phone-pad"
                                                    maxLength={10}
                                                />
                                            </View>
                                            {whatsappNumbers.length > 1 ? (
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        setWhatsappNumbers((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                                                    }}
                                                    className="ml-2 h-12 w-12 items-center justify-center rounded-2xl bg-red-50"
                                                    activeOpacity={0.8}
                                                >
                                                    <X size={18} color="#ef4444" />
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        onPress={() => setWhatsappNumbers((prev) => [...prev, ''])}
                                        className="mt-2 self-start flex-row items-center rounded-2xl bg-blue-50 px-4 py-2.5"
                                        activeOpacity={0.8}
                                    >
                                        <View className="mr-2 h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                                            <Plus size={14} color="#ffffff" />
                                        </View>
                                        <Text className="text-blue-600 font-semibold">Add Another</Text>
                                    </TouchableOpacity>
                                </View>

                                <View className="mb-3">
                                    <View className="mb-2 ml-1 flex-row items-center justify-between">
                                        <Text className="text-base font-bold text-gray-700">Number of Clinics</Text>
                                        <Text className="text-[11px] text-gray-500">You can change it later.</Text>
                                    </View>
                                    <View className="flex-row items-center justify-between bg-white rounded-2xl px-4 py-2 border-2 border-gray-200">
                                        <TextInput
                                            className="flex-1 pr-3 text-slate-800 text-lg font-bold py-2"
                                            value={String(numClinics)}
                                            onChangeText={(text) => {
                                                const digitsOnly = text.replace(/\D/g, '');
                                                const nextValue = digitsOnly ? Number(digitsOnly) : 0;
                                                setNumClinics(Math.min(Math.max(nextValue, 0), 99));
                                            }}
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            selectTextOnFocus
                                        />
                                        <View className="items-center justify-center">
                                            <TouchableOpacity
                                                onPress={() => setNumClinics((prev) => Math.min(prev + 1, 99))}
                                                className="w-9 h-7 items-center justify-center"
                                                activeOpacity={0.8}
                                            >
                                                <ChevronUp size={16} color="#475569" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => setNumClinics((prev) => Math.max(prev - 1, 0))}
                                                className="w-9 h-7 items-center justify-center"
                                                activeOpacity={0.8}
                                            >
                                                <ChevronDown size={16} color="#475569" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>

                                {renderContinueBackButtons({
                                    onBack: () => setStep(2),
                                    onContinue: () => setStep(4),
                                    continueDisabled: !canContinueStep3,
                                })}
                            </>
                        ) : step === 4 ? (
                            <>
                                {renderInput('Specialization', specialization, setSpecialization, 'Cardiology', <Stethoscope size={20} color="#64748b" />)}
                                {renderInput(
                                    'Medical Council Registration',
                                    registrationNo,
                                    (text) => setRegistrationNo(normalizeUppercaseText(text)),
                                    'e.g. MMC - 12345',
                                    <Hash size={20} color="#64748b" />,
                                    'default',
                                    'Enter council name with registration number',
                                    { autoCapitalize: 'characters' }
                                )}
                                {renderInput(
                                    'Education',
                                    education,
                                    (text) => setEducation(normalizeUppercaseText(text)),
                                    'MBBS, MD',
                                    <GraduationCap size={20} color="#64748b" />,
                                    'default',
                                    undefined,
                                    { autoCapitalize: 'characters' }
                                )}

                                <View className="mb-4 overflow-hidden rounded-[26px] border border-blue-100 bg-white">
                                    <View className="bg-blue-600 px-4 py-3">
                                        <Text className="text-white text-base font-extrabold">Medical Council / Degree Proof</Text>
                                    </View>

                                    <View className="px-4 py-4">
                                        <View className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 py-4">
                                            <View className="flex-row items-start">
                                                <View className="mr-3 mt-0.5 h-11 w-11 items-center justify-center rounded-2xl bg-white">
                                                    <FileText size={20} color="#2563eb" />
                                                </View>
                                                <View className="flex-1">
                                                    <Text className="text-base font-bold text-slate-800">
                                                        {documentUrl ? 'Document uploaded successfully' : 'Upload your supporting document'}
                                                    </Text>
                                                    <Text className="mt-1 text-xs leading-5 text-slate-500">
                                                        {documentUrl
                                                            ? 'Your education proof is attached and ready for submission.'
                                                            : 'Accepted formats: PDF, JPG, PNG, WEBP. Maximum size: 10 MB.'}
                                                    </Text>
                                                    {documentUrl ? (
                                                        <Text className="mt-2 text-[11px] font-semibold text-blue-700">
                                                            {documentMimeType ? documentMimeType.toUpperCase() : 'DOCUMENT READY'}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                                {documentUrl ? (
                                                    <TouchableOpacity
                                                        onPress={clearUploadedDocument}
                                                        activeOpacity={0.85}
                                                        className="ml-3 h-8 w-8 items-center justify-center rounded-full bg-white"
                                                    >
                                                        <X size={14} color="#64748b" />
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>

                                            <View className="mt-4 flex-row items-center gap-3">
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        void handleDocumentCamera();
                                                    }}
                                                    disabled={uploadingDocumentSource !== null}
                                                    activeOpacity={0.85}
                                                    className="flex-1 flex-row items-center justify-center rounded-2xl bg-white py-3"
                                                >
                                                    {uploadingDocumentSource === 'camera' ? <ActivityIndicator size="small" color="#2563eb" /> : <Camera size={16} color="#2563eb" />}
                                                    <Text className="ml-2 text-sm font-bold text-blue-700">Camera</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    onPress={() => {
                                                        void handleDocumentFile();
                                                    }}
                                                    disabled={uploadingDocumentSource !== null}
                                                    activeOpacity={0.85}
                                                    className="flex-1 flex-row items-center justify-center rounded-2xl bg-blue-600 py-3"
                                                >
                                                    {uploadingDocumentSource === 'file' ? <ActivityIndicator size="small" color="#ffffff" /> : <Upload size={16} color="#ffffff" />}
                                                    <Text className="ml-2 text-sm font-bold text-white">Files</Text>
                                                </TouchableOpacity>
                                            </View>

                                            {documentUrl ? (
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        void openUploadedDocument();
                                                    }}
                                                    activeOpacity={0.85}
                                                    className="mt-3 items-center rounded-2xl border border-blue-200 bg-white py-3"
                                                >
                                                    <Text className="text-sm font-semibold text-blue-700">Open uploaded document</Text>
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    </View>
                                </View>

                                {renderContinueBackButtons({
                                    onBack: () => setStep(3),
                                    onContinue: () => setStep(5),
                                    continueDisabled: !canContinueStep4,
                                })}
                            </>
                        ) : step === 5 ? (
                            <>
                                {renderInput(
                                    'Address',
                                    address,
                                    setAddress,
                                    'Clinic or residence address',
                                    <MapPin size={20} color="#64748b" />,
                                    'default',
                                    undefined,
                                    { inputRef: addressInputRef }
                                )}
                                {renderInput('GST Number (Optional)', gstNumber, setGstNumber, '22AAAAA0000A1Z5', <FileText size={20} color="#64748b" />)}
                                {renderInput('PAN Number (Optional)', panNumber, setPanNumber, 'ABCDE1234F', <FileDigit size={20} color="#64748b" />)}

                                {renderContinueBackButtons({
                                    onBack: () => setStep(4),
                                    onContinue: () => setStep(6),
                                    continueDisabled: !canSubmit,
                                    continueLabel: 'Continue to Verification',
                                })}
                            </>
                        ) : (
                            renderVerificationStep()
                        )}

                        <TouchableOpacity onPress={() => navigation.replace('Login')} className="mt-4 self-center" activeOpacity={0.8}>
                            <Text className="text-blue-600 font-semibold">Already have an account? Sign in</Text>
                        </TouchableOpacity>

                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
            {renderPreviewModal({
                visible: showProfilePreview,
                title: 'Profile Picture',
                url: profilePicUrl,
                mimeType: profilePicMimeType,
                onClose: () => {
                    setPreviewModalLoading(false);
                    setShowProfilePreview(false);
                },
            })}
            {renderPreviewModal({
                visible: showDocumentPreview,
                title: 'Education Document',
                url: documentUrl,
                mimeType: documentMimeType,
                onClose: () => {
                    setPreviewModalLoading(false);
                    setShowDocumentPreview(false);
                },
            })}
        </SafeAreaView>
    );
}
