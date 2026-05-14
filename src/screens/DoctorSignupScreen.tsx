import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    ArrowLeft,
    ArrowRight,
    Calculator,
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
    RefreshCw,
    ShieldCheck,
    Stethoscope,
    Upload,
    User,
    X,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import {
    doctorSignup,
    getLoginChallenge,
    verifyLoginChallenge,
} from '../api/auth';
import { uploadDoctorSignupDocument, uploadDoctorSignupProfilePicture } from '../api/uploads';
import type { RootStackParamList } from '../navigation/types';

type DoctorSignupScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DoctorSignup'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type SignupUploadFile = { uri: string; name: string; mimeType: string };
type UploadReverificationTarget = 'profile' | 'document' | null;

export default function DoctorSignupScreen() {
    const navigation = useNavigation<DoctorSignupScreenNavigationProp>();
    const insets = useSafeAreaInsets();
    const allowedDocumentMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedProfilePicMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
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
    const [uploadReverificationTarget, setUploadReverificationTarget] = useState<UploadReverificationTarget>(null);
    const [pendingDocumentUpload, setPendingDocumentUpload] = useState<SignupUploadFile | null>(null);
    const [pendingProfilePicUpload, setPendingProfilePicUpload] = useState<SignupUploadFile | null>(null);
    const [challengeQuestion, setChallengeQuestion] = useState('');
    const [challengeId, setChallengeId] = useState('');
    const [challengeAnswer, setChallengeAnswer] = useState('');
    const [challengeVerificationToken, setChallengeVerificationToken] = useState('');
    const [challengeVerified, setChallengeVerified] = useState(false);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [verifyingChallenge, setVerifyingChallenge] = useState(false);
    const [challengeStatus, setChallengeStatus] = useState<'idle' | 'success'>('idle');
    const [uploadAnswerInputActive, setUploadAnswerInputActive] = useState(false);
    const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
    const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
    const hasWhatsappNumber = whatsappNumbers.some((value) => value.trim().length > 0);
    const normalizedEmail = email.trim().toLowerCase();
    const hasValidEmail = EMAIL_REGEX.test(normalizedEmail);
    const showEmailFormatError = emailTouched && normalizedEmail.length > 0 && !hasValidEmail;

    const canContinue = useMemo(
        () => Boolean(hasValidEmail && password && confirmPassword && challengeAnswer.trim() && passwordsMatch),
        [challengeAnswer, confirmPassword, hasValidEmail, password, passwordsMatch]
    );

    const canContinueStep2 = useMemo(() => Boolean(doctorName.trim() && phone.trim()), [doctorName, phone]);

    const canContinueStep3 = useMemo(() => hasWhatsappNumber, [hasWhatsappNumber]);

    const canContinueStep4 = useMemo(
        () =>
            Boolean(
                specialization.trim() &&
                registrationNo.trim() &&
                education.trim() &&
                documentUrl.trim()
            ),
        [documentUrl, education, registrationNo, specialization]
    );

    const canSubmit = useMemo(() => Boolean(address.trim()), [address]);

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
            }
        } catch {
            setChallengeQuestion('');
            setChallengeId('');
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

    const isChallengeProofError = (error: any) => {
        const message = String(error?.message || error?.response?.data?.error || '').toLowerCase();
        return message.includes('calculation expired') || message.includes('verify the calculation') || message.includes('verified calculation');
    };

    const requestUploadReverification = async (target: Exclude<UploadReverificationTarget, null>) => {
        setUploadReverificationTarget(target);
        setUploadAnswerInputActive(false);
        await loadLoginChallenge();
    };

    useEffect(() => {
        void loadLoginChallenge();
    }, []);

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

        if (!challengeId || !challengeVerified || !challengeVerificationToken) {
            Alert.alert('Verification Required', 'Please solve and verify the calculation before continuing.');
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

            if (!primaryWhatsappNumber || !specialization.trim() || !registrationNo.trim() || !education.trim() || !documentUrl.trim() || !address.trim()) {
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

            if (!challengeId || !challengeVerified || !challengeVerificationToken) {
                Alert.alert('Verification Required', 'Please solve and verify the calculation before signing up.');
                return;
            }

            const response = await doctorSignup({
                email: normalizedEmail,
                password,
                confirmPassword,
                doctor_name: doctorName.trim(),
                phone: phone.trim(),
                num_clinics: numClinics,
                whatsapp_number: primaryWhatsappNumber,
                whatsapp_numbers: whatsappNumbers.map((value) => value.trim()).filter(Boolean),
                specialization: specialization.trim(),
                registration_no: registrationNo.trim(),
                education: education.trim(),
                document_url: documentUrl.trim(),
                profile_pic_url: profilePicUrl.trim(),
                address: address.trim(),
                gst_number: gstNumber.trim(),
                pan_number: panNumber.trim(),
                challengeId,
                challengeVerificationToken,
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

            if (status === 400) {
                setChallengeVerified(false);
                await loadLoginChallenge();
            } else if (status === 409) {
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
        if (!challengeId || !challengeVerified || !challengeVerificationToken) {
            setUploadingDocumentSource(null);
            setPendingDocumentUpload(file);
            await requestUploadReverification('document');
            return;
        }

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
                challengeId,
                challengeVerificationToken,
            });
            setDocumentUrl(uploaded.url);
            setDocumentMimeType(uploaded.mimeType || file.mimeType);
            setPendingDocumentUpload(null);
            setUploadReverificationTarget((current) => (current === 'document' ? null : current));
        } catch (error: any) {
            if (isChallengeProofError(error)) {
                setPendingDocumentUpload(file);
                await requestUploadReverification('document');
                return;
            }
            Alert.alert('Upload Failed', error?.message || 'Unable to upload degree document.');
        } finally {
            setUploadingDocumentSource(null);
        }
    };

    const uploadSignupProfilePicture = async (file: SignupUploadFile) => {
        if (!challengeId || !challengeVerified || !challengeVerificationToken) {
            setUploadingProfilePicSource(null);
            setPendingProfilePicUpload(file);
            await requestUploadReverification('profile');
            return;
        }

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
                challengeId,
                challengeVerificationToken,
            });
            setProfilePicUrl(uploaded.url);
            setProfilePicMimeType(uploaded.mimeType || file.mimeType);
            setProfilePicPreviewLoading(true);
            setPendingProfilePicUpload(null);
            setUploadReverificationTarget((current) => (current === 'profile' ? null : current));
        } catch (error: any) {
            if (isChallengeProofError(error)) {
                setPendingProfilePicUpload(file);
                await requestUploadReverification('profile');
                return;
            }
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
        setUploadingDocumentSource('camera');
        await uploadSignupDocument({
            uri: asset.uri,
            name: asset.fileName || `degree-${Date.now()}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
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
        setUploadingProfilePicSource('camera');
        await uploadSignupProfilePicture({
            uri: asset.uri,
            name: asset.fileName || `profile-${Date.now()}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
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

    const retryPendingDocumentUpload = async () => {
        if (!pendingDocumentUpload) return;
        setUploadingDocumentSource('file');
        await uploadSignupDocument(pendingDocumentUpload);
    };

    const retryPendingProfilePicUpload = async () => {
        if (!pendingProfilePicUpload) return;
        setUploadingProfilePicSource('file');
        await uploadSignupProfilePicture(pendingProfilePicUpload);
    };

    const renderInput = (
        label: string,
        value: string,
        onChangeText: (text: string) => void,
        placeholder: string,
        icon?: React.ReactNode,
        keyboardType: 'default' | 'email-address' | 'phone-pad' = 'default'
    ) => (
        <View className="mb-3">
            <Text className="text-base font-bold text-gray-700 mb-2 ml-1">{label}</Text>
            <View className="flex-row items-center bg-white rounded-2xl px-4 border-2 border-gray-200">
                {icon}
                <TextInput
                    className="flex-1 px-3 text-base text-slate-800 py-4"
                    placeholder={placeholder}
                    placeholderTextColor="#9ca3af"
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                    autoCapitalize="none"
                />
            </View>
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
                className="flex-1 rounded-2xl items-center justify-center py-3.5 bg-gray-100"
            >
                <Text className="text-gray-700 font-bold text-base">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onContinue}
                disabled={continueDisabled}
                activeOpacity={0.8}
                className={`flex-1 rounded-2xl items-center justify-center py-3.5 ${
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
                    <View className="flex-row items-center">
                        <Text className="text-white font-extrabold mr-2 tracking-wide text-base">{continueLabel}</Text>
                        <ArrowRight size={18} color="#fff" />
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );

    const renderUploadReverification = ({
        target,
        onRetry,
        retryDisabled,
    }: {
        target: Exclude<UploadReverificationTarget, null>;
        onRetry: () => void;
        retryDisabled: boolean;
    }) => {
        if (uploadReverificationTarget !== target) return null;

        return (
            <View className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm font-extrabold text-orange-700">Re-verify calculation</Text>
                    <TouchableOpacity
                        onPress={() => {
                            void loadLoginChallenge();
                        }}
                        disabled={challengeLoading || verifyingChallenge}
                        activeOpacity={0.85}
                        className="h-8 w-8 items-center justify-center rounded-full bg-white"
                    >
                        <RefreshCw size={14} color="#ea580c" />
                    </TouchableOpacity>
                </View>

                <View className="flex-row items-center rounded-2xl bg-white px-3 py-2">
                    <Calculator size={18} color="#ea580c" />
                    <View className="ml-3 flex-1 flex-row items-center">
                        {challengeLoading ? (
                            <Text className="text-slate-700 font-bold text-lg">Loading...</Text>
                        ) : challengeQuestion ? (
                            <>
                                <Text className="text-slate-800 font-bold text-xl mr-2">
                                    {challengeQuestion.replace('?', '')}
                                </Text>
                                {challengeAnswer === '' && !uploadAnswerInputActive && !challengeVerified ? (
                                    <TouchableOpacity
                                        activeOpacity={0.9}
                                        onPress={() => setUploadAnswerInputActive(true)}
                                        className="bg-white items-center justify-center px-2 rounded-xl border border-orange-200"
                                        style={{ width: 72, height: 42 }}
                                    >
                                        <Text className="font-bold text-gray-400" style={{ fontSize: 20 }}>?</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <TextInput
                                        autoFocus={uploadAnswerInputActive && !challengeVerified}
                                        className="bg-white text-center font-bold text-slate-800 px-2 rounded-xl border border-orange-200"
                                        placeholder="?"
                                        placeholderTextColor="#9ca3af"
                                        value={challengeAnswer}
                                        onChangeText={(text) => {
                                            setChallengeAnswer(text);
                                            if (text === '' && !challengeVerified) {
                                                setUploadAnswerInputActive(false);
                                            }
                                        }}
                                        onBlur={() => {
                                            if (!challengeAnswer && !challengeVerified) {
                                                setUploadAnswerInputActive(false);
                                            }
                                        }}
                                        keyboardType="number-pad"
                                        maxLength={4}
                                        editable={!challengeLoading && !challengeVerified}
                                        style={{
                                            width: 72,
                                            height: 42,
                                            textAlign: 'center',
                                            fontSize: 20,
                                            lineHeight: 24,
                                        }}
                                    />
                                )}
                            </>
                        ) : (
                            <Text className="text-slate-700 font-bold text-lg">Unavailable</Text>
                        )}
                    </View>
                    <View className="ml-2 h-8 w-8 items-center justify-center">
                        {verifyingChallenge ? (
                            <ActivityIndicator color="#ea580c" size="small" />
                        ) : challengeStatus === 'success' ? (
                            <Animated.View entering={ZoomIn.duration(220)} className="h-8 w-8 rounded-xl bg-emerald-500 items-center justify-center">
                                <Check size={16} color="#ffffff" />
                            </Animated.View>
                        ) : null}
                    </View>
                </View>

                <TouchableOpacity
                    onPress={onRetry}
                    disabled={retryDisabled || !challengeVerified || !challengeVerificationToken}
                    activeOpacity={0.85}
                    className={`mt-3 items-center rounded-2xl py-3 ${
                        retryDisabled || !challengeVerified || !challengeVerificationToken ? 'bg-orange-200' : 'bg-orange-500'
                    }`}
                >
                    <Text className="text-sm font-extrabold text-white">Retry upload</Text>
                </TouchableOpacity>
            </View>
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
                                <Text className="text-xs font-bold text-blue-700">{`Step ${step} of 5`}</Text>
                            </View>
                            <Text className="font-extrabold text-slate-800 mb-1 text-[28px]">Create Account</Text>
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
                                            <View className="flex-1 min-w-0 flex-row items-center flex-wrap ml-4">
                                                {challengeLoading ? (
                                                    <Text className="text-slate-800 font-bold text-2xl mr-2 shrink">Loading...</Text>
                                                ) : challengeQuestion ? (
                                                    <>
                                                        <Text className="text-slate-800 font-bold text-[28px] mr-2 shrink">
                                                            {challengeQuestion.replace('?', '')}
                                                        </Text>
                                                        <TextInput
                                                            className="bg-white text-center font-bold text-slate-800 ml-2 px-2 rounded-2xl border border-blue-200 shrink-0"
                                                            placeholder="?"
                                                            placeholderTextColor="#9ca3af"
                                                            value={challengeAnswer}
                                                            onChangeText={setChallengeAnswer}
                                                            keyboardType="number-pad"
                                                            maxLength={4}
                                                            editable={!challengeLoading && !challengeVerified}
                                                            style={{
                                                                width: 96,
                                                                height: 56,
                                                                textAlign: 'center',
                                                                fontSize: 28,
                                                                lineHeight: 32,
                                                            }}
                                                        />
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

                                {renderContinueBackButtons({
                                    onBack: () => navigation.goBack(),
                                    onContinue: handleContinue,
                                    continueDisabled: loading || !canContinue,
                                })}
                            </>
                        ) : step === 2 ? (
                            <>
                                {renderInput('Doctor Name', doctorName, setDoctorName, 'Your Name', <User size={20} color="#64748b" />)}
                                {renderInput('Appointment Phone Number', phone, setPhone, '9876543210', <Phone size={20} color="#64748b" />, 'phone-pad')}

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

                                            {renderUploadReverification({
                                                target: 'profile',
                                                onRetry: () => {
                                                    void retryPendingProfilePicUpload();
                                                },
                                                retryDisabled: uploadingProfilePicSource !== null || !pendingProfilePicUpload,
                                            })}
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
                                    <Text className="text-base font-bold text-gray-700 mb-2 ml-1">WhatsApp Number</Text>
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
                                                        setWhatsappNumbers((prev) => prev.map((item, itemIndex) => (itemIndex === index ? text : item)));
                                                    }}
                                                    keyboardType="phone-pad"
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
                                {renderInput('Registration Number', registrationNo, setRegistrationNo, 'Medical registration number', <Hash size={20} color="#64748b" />)}
                                {renderInput('Education', education, setEducation, 'MBBS, MD', <GraduationCap size={20} color="#64748b" />)}

                                <View className="mb-4 overflow-hidden rounded-[26px] border border-blue-100 bg-white">
                                    <View className="bg-blue-600 px-4 py-3">
                                        <Text className="text-white text-base font-extrabold">Education / Degree Proof</Text>
                                        <Text className="mt-1 text-xs text-blue-100">
                                            Upload a clear image or PDF of your degree certificate before continuing.
                                        </Text>
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

                                            {renderUploadReverification({
                                                target: 'document',
                                                onRetry: () => {
                                                    void retryPendingDocumentUpload();
                                                },
                                                retryDisabled: uploadingDocumentSource !== null || !pendingDocumentUpload,
                                            })}

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
                        ) : (
                            <>
                                {renderInput('Address', address, setAddress, 'Clinic or residence address', <MapPin size={20} color="#64748b" />)}
                                {renderInput('GST Number (Optional)', gstNumber, setGstNumber, '22AAAAA0000A1Z5', <FileText size={20} color="#64748b" />)}
                                {renderInput('PAN Number (Optional)', panNumber, setPanNumber, 'ABCDE1234F', <FileDigit size={20} color="#64748b" />)}

                                {renderContinueBackButtons({
                                    onBack: () => setStep(4),
                                    onContinue: handleSignup,
                                    continueDisabled: loading || !canSubmit,
                                    continueLabel: 'Submit Your Profile',
                                    continueLoading: loading,
                                })}
                            </>
                        )}

                        <TouchableOpacity onPress={() => navigation.replace('Login')} className="mt-4 self-center" activeOpacity={0.8}>
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
