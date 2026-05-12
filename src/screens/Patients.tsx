import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    ActivityIndicator,
    StatusBar,
    TouchableOpacity,
    Animated,
    Modal,
    ScrollView,
    TextInput,
    Alert,
    RefreshControl,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import {
    User,
    Phone,
    Plus,
    X,
    Stethoscope,
    Users,
    MessageCircle,
    Trash2,
    Camera,
    ImagePlus,
    CalendarDays,
    ChevronRight,
    Clock3,
    RefreshCcw,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPatients, createPatient } from '../api/patients';
import { createPrescriptionUpload, deletePrescriptionRecord, listPrescriptions, type PrescriptionUploadFile } from '../api/prescriptions';
import { getAppointments } from '../api/appointments';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { getChatNotifications } from '../api/notifications';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import { markDoctorPatientChatRead } from '../lib/mobileNotificationState';
import PrescriptionImageViewerModal from '../components/PrescriptionImageViewerModal';
import PrescriptionHistoryCard from '../components/PrescriptionHistoryCard';
import PrescriptionUploadPreviewGrid from '../components/PrescriptionUploadPreviewGrid';
import {
    appendPrescriptionUploadFiles as mergePrescriptionUploadFiles,
    pickPrescriptionImagesFromCamera,
    pickPrescriptionImagesFromLibrary,
    PRESCRIPTION_MAX_PAGE_COUNT,
} from '../lib/prescriptionImageUpload';
import { getPrescriptionErrorMessage } from '../lib/prescriptionErrors';

const AnimatedListItem = ({ children, index }: { children: React.ReactNode, index: number }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 100, useNativeDriver: true })
        ]).start();
    }, []);

    return <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>{children}</Animated.View>;
};

interface PrescriptionPageItem {
    prescription_page_id: number;
    page_number: number;
    storage_key: string;
    file_url: string;
    mime_type: string | null;
    original_file_name: string | null;
    file_size_bytes: number | null;
    width: number | null;
    height: number | null;
    created_at: string;
}

interface PrescriptionRecordItem {
    prescription_id: number;
    patient_id: number;
    doctor_id: number;
    clinic_id: number | null;
    appointment_id: number | null;
    uploaded_by_role: 'PATIENT' | 'DOCTOR' | 'STAFF';
    uploaded_by_user_id: number | null;
    uploaded_by_patient_id: number | null;
    note: string | null;
    page_count: number;
    status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
    created_at: string;
    updated_at: string;
    pages: PrescriptionPageItem[];
    uploaded_by_user?: {
        user_id: number;
        name?: string | null;
        email?: string | null;
    } | null;
    uploaded_by_patient?: {
        patient_id: number;
        full_name?: string | null;
        phone?: string | null;
    } | null;
}

interface AppointmentHistoryItem {
    appointment_id: number;
    booking_id?: number | null;
    appointment_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    status?: string | null;
    patient_id?: number | null;
    doctor_id?: number | null;
    clinic_id?: number | null;
    clinic?: {
        clinic_id?: number | null;
        clinic_name?: string | null;
    } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    BOOKED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Booked' },
    PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Not Visited' },
    COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Visited' },
    CANCELLED: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Cancelled' },
};

const formatDateTimeLabel = (dateValue?: string | null, timeValue?: string | null) => {
    if (!dateValue) return 'Unknown date';
    const datePart = String(dateValue).split('T')[0];
    const date = new Date(`${datePart}T00:00:00+05:30`);
    const dateLabel = Number.isNaN(date.getTime())
        ? datePart
        : date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Kolkata',
        });

    return `${dateLabel} · ${formatTimeLabel(timeValue)}`;
};

const formatTimeLabel = (value?: string | null) => {
    if (!value) return 'Time not set';
    if (/AM|PM/i.test(value)) return value;
    const [hourText = '', minuteText = '00'] = value.split(':');
    const hour = Number(hourText);
    if (!Number.isFinite(hour)) return value;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const normalizedHour = hour % 12 || 12;
    return `${normalizedHour}:${minuteText} ${suffix}`;
};

const formatAppointmentTimeLabel = (value?: string | null) => {
    if (!value) return 'Time not set';
    const raw = String(value).trim();
    if (/AM|PM/i.test(raw)) return raw;

    const plainTimeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (plainTimeMatch) {
        const hour = Number(plainTimeMatch[1]);
        const minute = plainTimeMatch[2];
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const normalizedHour = hour % 12 || 12;
        return `${normalizedHour}:${minute} ${suffix}`;
    }

    const isoDate = new Date(raw);
    if (!Number.isNaN(isoDate.getTime())) {
        const hours = isoDate.getUTCHours();
        const minutes = isoDate.getUTCMinutes();
        const suffix = hours >= 12 ? 'PM' : 'AM';
        const normalizedHour = hours % 12 || 12;
        return `${normalizedHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
    }

    return raw;
};

const formatAppointmentDateTimeLabel = (dateValue?: string | null, timeValue?: string | null) => {
    if (!dateValue) return 'Unknown date';
    const datePart = String(dateValue).split('T')[0];
    const date = new Date(`${datePart}T00:00:00+05:30`);
    const dateLabel = Number.isNaN(date.getTime())
        ? datePart
        : date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Kolkata',
        });

    return `${dateLabel} | ${formatAppointmentTimeLabel(timeValue)}`;
};

const Patients = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const route = useRoute<RouteProp<MainTabParamList, 'Patients'>>();
    const isFocused = useIsFocused();
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [unreadPatientIds, setUnreadPatientIds] = useState<Set<number>>(new Set());
    const lastNotifCheckAtRef = useRef<string>(new Date(Date.now() - 2 * 60 * 1000).toISOString());
    const socketRef = useRef<Socket | null>(null);
    const [prescriptionVisible, setPrescriptionVisible] = useState(false);
    const [prescriptionLoading, setPrescriptionLoading] = useState(false);
    const [prescriptionError, setPrescriptionError] = useState('');
    const [prescriptionRecords, setPrescriptionRecords] = useState<PrescriptionRecordItem[]>([]);
    const [prescriptionTarget, setPrescriptionTarget] = useState<{
        patient_id: number;
        doctor_id: number;
        patient_name?: string | null;
    } | null>(null);
    const [prescriptionUploadLoading, setPrescriptionUploadLoading] = useState(false);
    const [prescriptionUploadFiles, setPrescriptionUploadFiles] = useState<PrescriptionUploadFile[]>([]);
    const [prescriptionUploadNote, setPrescriptionUploadNote] = useState('');
    const [prescriptionViewerVisible, setPrescriptionViewerVisible] = useState(false);
    const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionRecordItem | null>(null);
    const lastHandledPrescriptionRequestRef = useRef<string | null>(null);
    const [patientActionVisible, setPatientActionVisible] = useState(false);
    const [selectedPatientAction, setSelectedPatientAction] = useState<any | null>(null);
    const [appointmentHistoryVisible, setAppointmentHistoryVisible] = useState(false);
    const [appointmentHistoryLoading, setAppointmentHistoryLoading] = useState(false);
    const [appointmentHistoryRefreshing, setAppointmentHistoryRefreshing] = useState(false);
    const [appointmentHistoryError, setAppointmentHistoryError] = useState('');
    const [appointmentHistoryRecords, setAppointmentHistoryRecords] = useState<AppointmentHistoryItem[]>([]);
    const [appointmentHistoryTarget, setAppointmentHistoryTarget] = useState<{
        patient_id: number;
        doctor_id: number;
        patient_name?: string | null;
    } | null>(null);
    const [selectedClinicFilter, setSelectedClinicFilter] = useState<string>('ALL');

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchPatients();
        setRefreshing(false);
    };

    const [formData, setFormData] = useState({
        full_name: '',
        age: '',
        gender: 'MALE',
        phone: '',
        reason: '',
        patient_type: 'NEW'
    });

    // Poll for new notifications and mark which patients have unread messages
    const checkNotifications = useCallback(async () => {
        if (!isFocused) return;
        try {
            const result = await getChatNotifications(lastNotifCheckAtRef.current);
            lastNotifCheckAtRef.current = new Date().toISOString();
            if (result?.latestMessage?.patientId && !result.latestMessage.isAnnouncement) {
                setUnreadPatientIds((prev) => {
                    const next = new Set(prev);
                    next.add(result.latestMessage!.patientId);
                    return next;
                });
            }
        } catch {
            // ignore
        }
    }, [isFocused]);

    useEffect(() => {
        if (!isFocused) return;
        fetchPatients();
        checkNotifications();
        const interval = setInterval(checkNotifications, 9000);
        return () => clearInterval(interval);
    }, [checkNotifications, isFocused]);

    // WebSocket: listen for incoming patient messages and mark unread
    useEffect(() => {
        if (!isFocused) return;
        if (!patients.length) return;
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;

        socket.on('receive_message', (msg: any) => {
            if (!msg || msg.sender !== 'PATIENT') return;
            const pid = Number(msg.patient_id);
            if (!pid) return;
            setUnreadPatientIds((prev) => {
                const next = new Set(prev);
                next.add(pid);
                return next;
            });
        });

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isFocused, patients]);

    const fetchPatients = async () => {
        setLoading(true);
        try {
            const data = await getPatients();
            setPatients(data.patients || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePatient = async () => {
        if (!formData.full_name || !formData.phone || !formData.age) {
            Alert.alert("Error", "Please fill name, phone, and age fields");
            return;
        }

        setSubmitting(true);
        try {
            await createPatient(formData);
            Alert.alert("Success", "Patient added successfully");
            setModalVisible(false);
            setFormData({
                full_name: '',
                age: '',
                gender: 'MALE',
                phone: '',
                reason: '',
                patient_type: 'NEW'
            });
            fetchPatients();
        } catch (e) {
            Alert.alert("Error", "Failed to add patient");
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const filteredPatients = patients
        .filter(p =>
            p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.phone?.includes(searchQuery)
        )
        .sort((a, b) => {
            const aUnread = unreadPatientIds.has(Number(a.patient_id)) ? 0 : 1;
            const bUnread = unreadPatientIds.has(Number(b.patient_id)) ? 0 : 1;
            return aUnread - bUnread;
        });

    const clinicFilterOptions = React.useMemo(() => {
        const uniqueClinics = new Map<string, { key: string; label: string }>();

        appointmentHistoryRecords.forEach((appointment) => {
            const clinicId = Number(appointment?.clinic_id ?? appointment?.clinic?.clinic_id ?? 0);
            const clinicName = appointment?.clinic?.clinic_name || (clinicId ? `Clinic ${clinicId}` : 'Unknown Clinic');
            if (clinicId > 0 && !uniqueClinics.has(String(clinicId))) {
                uniqueClinics.set(String(clinicId), {
                    key: String(clinicId),
                    label: clinicName,
                });
            }
        });

        return [{ key: 'ALL', label: 'All Clinics' }, ...Array.from(uniqueClinics.values())];
    }, [appointmentHistoryRecords]);

    const visibleAppointmentHistory = React.useMemo(() => {
        if (selectedClinicFilter === 'ALL') return appointmentHistoryRecords;
        return appointmentHistoryRecords.filter((appointment) => {
            const clinicId = Number(appointment?.clinic_id ?? appointment?.clinic?.clinic_id ?? 0);
            return String(clinicId) === selectedClinicFilter;
        });
    }, [appointmentHistoryRecords, selectedClinicFilter]);

    const appointmentHistorySummary = React.useMemo(() => {
        return visibleAppointmentHistory.reduce(
            (acc, appointment) => {
                const status = String(appointment.status || 'BOOKED').toUpperCase();
                acc.total += 1;
                if (status === 'COMPLETED') acc.visited += 1;
                else if (status === 'PENDING') acc.notVisited += 1;
                else if (status === 'CANCELLED') acc.cancelled += 1;
                return acc;
            },
            { total: 0, visited: 0, notVisited: 0, cancelled: 0 }
        );
    }, [visibleAppointmentHistory]);

    const handleOpenChat = (item: any) => {
        const patientId = Number(item?.patient_id);
        const doctorId = Number(item?.doctor_id);

        if (!patientId || !doctorId) {
            Alert.alert('Chat unavailable', 'This patient is not linked to a doctor yet.');
            return;
        }

        // Clear the unread badge for this patient when opening chat
        setUnreadPatientIds((prev) => {
            const next = new Set(prev);
            next.delete(patientId);
            return next;
        });
        markDoctorPatientChatRead(patientId);
        lastNotifCheckAtRef.current = new Date().toISOString();

        navigation.navigate('Chat', {
            patientId,
            doctorId,
            patientName: item?.full_name || 'Unknown Patient',
            viewer: 'DOCTOR',
        });
    };

    const closePrescriptionViewer = useCallback(() => {
        setPrescriptionViewerVisible(false);
        setSelectedPrescription(null);
    }, []);

    const closePatientActionMenu = useCallback(() => {
        setPatientActionVisible(false);
        setSelectedPatientAction(null);
    }, []);

    const closePrescriptionFlow = useCallback(() => {
        closePrescriptionViewer();
        setPrescriptionVisible(false);
        setPrescriptionLoading(false);
        setPrescriptionError('');
        setPrescriptionRecords([]);
        setPrescriptionTarget(null);
        setPrescriptionUploadFiles([]);
        setPrescriptionUploadNote('');
        setPrescriptionUploadLoading(false);
    }, [closePrescriptionViewer]);

    const closeAppointmentHistoryFlow = useCallback(() => {
        setAppointmentHistoryVisible(false);
        setAppointmentHistoryLoading(false);
        setAppointmentHistoryError('');
        setAppointmentHistoryRecords([]);
        setAppointmentHistoryTarget(null);
        setSelectedClinicFilter('ALL');
    }, []);

    const formatPrescriptionUploader = useCallback((record: PrescriptionRecordItem) => {
        if (record.uploaded_by_role === 'PATIENT') {
            return record.uploaded_by_patient?.full_name
                ? `Uploaded by: Patient - ${record.uploaded_by_patient.full_name}`
                : 'Uploaded by: Patient';
        }

        if (record.uploaded_by_role === 'DOCTOR') {
            return record.uploaded_by_user?.name
                ? `Uploaded by: Doctor - ${record.uploaded_by_user.name}`
                : 'Uploaded by: Doctor';
        }

        return record.uploaded_by_user?.name
            ? `Uploaded by: Staff - ${record.uploaded_by_user.name}`
            : 'Uploaded by: Staff';
    }, []);

    const loadPrescriptionList = useCallback(async (target: {
        patient_id: number;
        doctor_id: number;
        patient_name?: string | null;
    }) => {
        setPrescriptionLoading(true);
        setPrescriptionError('');
        setPrescriptionTarget(target);
        setPrescriptionVisible(true);
        try {
            const data = await listPrescriptions({
                patient_id: target.patient_id,
                doctor_id: target.doctor_id,
            });
            setPrescriptionRecords((data?.prescriptions || []) as PrescriptionRecordItem[]);
        } catch (error: any) {
            setPrescriptionError(getPrescriptionErrorMessage(error, 'Failed to load prescriptions'));
        } finally {
            setPrescriptionLoading(false);
        }
    }, []);

    const openPrescriptionHistory = useCallback((item: any) => {
        const patientId = Number(item?.patient_id ?? 0);
        const doctorId = Number(item?.doctor_id ?? 0);
        if (!patientId || !doctorId) {
            Alert.alert('Unavailable', 'Prescription history is not available for this patient.');
            return;
        }

        void loadPrescriptionList({
            patient_id: patientId,
            doctor_id: doctorId,
            patient_name: item?.full_name || 'Patient',
        });
    }, [loadPrescriptionList]);

    const openPatientActionMenu = useCallback((item: any) => {
        const patientId = Number(item?.patient_id ?? 0);
        const doctorId = Number(item?.doctor_id ?? 0);

        if (!patientId || !doctorId) {
            Alert.alert('Unavailable', 'This patient is not linked properly yet.');
            return;
        }

        setSelectedPatientAction(item);
        setPatientActionVisible(true);
    }, []);

    const loadAppointmentHistory = useCallback(async (item: any, options?: { preserveState?: boolean; refreshOnly?: boolean }) => {
        const patientId = Number(item?.patient_id ?? 0);
        const doctorId = Number(item?.doctor_id ?? 0);

        if (!patientId || !doctorId) {
            Alert.alert('Unavailable', 'Appointment history is not available for this patient.');
            return;
        }

        const preserveState = options?.preserveState === true;
        const refreshOnly = options?.refreshOnly === true;

        if (!refreshOnly) {
            setAppointmentHistoryVisible(true);
        }

        if (preserveState) {
            setAppointmentHistoryRefreshing(true);
        } else {
            setAppointmentHistoryLoading(true);
            setAppointmentHistoryRecords([]);
            setSelectedClinicFilter('ALL');
        }

        setAppointmentHistoryError('');
        setAppointmentHistoryTarget({
            patient_id: patientId,
            doctor_id: doctorId,
            patient_name: item?.full_name || item?.patient_name || 'Patient',
        });

        try {
            const data = await getAppointments();
            const allAppointments = Array.isArray(data) ? data : data?.appointments || [];
            const filtered = allAppointments
                .filter((appointment: any) =>
                    Number(appointment?.patient_id ?? appointment?.patient?.patient_id ?? 0) === patientId &&
                    Number(appointment?.doctor_id ?? 0) === doctorId
                )
                .sort((a: any, b: any) => {
                    const left = new Date(`${a?.appointment_date || ''}T${a?.start_time || '00:00:00'}`).getTime();
                    const right = new Date(`${b?.appointment_date || ''}T${b?.start_time || '00:00:00'}`).getTime();
                    return right - left;
                });

            setAppointmentHistoryRecords(filtered);
        } catch (error: any) {
            setAppointmentHistoryError(getPrescriptionErrorMessage(error, 'Failed to load appointment history'));
        } finally {
            if (preserveState) {
                setAppointmentHistoryRefreshing(false);
            } else {
                setAppointmentHistoryLoading(false);
            }
        }
    }, []);

    const refreshAppointmentHistory = useCallback(async () => {
        if (selectedPatientAction) {
            await loadAppointmentHistory(selectedPatientAction, { preserveState: true, refreshOnly: true });
            return;
        }
        if (appointmentHistoryTarget) {
            await loadAppointmentHistory(appointmentHistoryTarget, { preserveState: true, refreshOnly: true });
        }
    }, [appointmentHistoryTarget, loadAppointmentHistory, selectedPatientAction]);

    const appendPrescriptionFiles = useCallback((nextFiles: PrescriptionUploadFile[]) => {
        setPrescriptionUploadFiles((prev) => mergePrescriptionUploadFiles(prev, nextFiles));
    }, []);

    const removePrescriptionFileAt = useCallback((index: number) => {
        setPrescriptionUploadFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    }, []);

    const handlePickPrescriptionFromCamera = useCallback(async () => {
        const result = await pickPrescriptionImagesFromCamera();
        if (!result.ok) {
            Alert.alert('Permission required', result.error);
            return;
        }
        if (result.files.length === 0) return;
        appendPrescriptionFiles(result.files);
    }, [appendPrescriptionFiles]);

    const handlePickPrescriptionFromGallery = useCallback(async () => {
        const remainingSlots = Math.max(0, PRESCRIPTION_MAX_PAGE_COUNT - prescriptionUploadFiles.length);
        const result = await pickPrescriptionImagesFromLibrary(remainingSlots);
        if (!result.ok) {
            Alert.alert('Unable to add pages', result.error);
            return;
        }
        if (result.files.length === 0) return;
        appendPrescriptionFiles(result.files);
    }, [appendPrescriptionFiles, prescriptionUploadFiles.length]);

    const handlePrescriptionUpload = useCallback(async () => {
        if (!prescriptionTarget?.patient_id || !prescriptionTarget?.doctor_id) {
            Alert.alert('Error', 'Missing prescription upload context.');
            return;
        }
        if (prescriptionUploadFiles.length === 0) {
            Alert.alert('Add prescription', 'Please add at least one prescription image.');
            return;
        }

        setPrescriptionUploadLoading(true);
        try {
            await createPrescriptionUpload({
                patient_id: prescriptionTarget.patient_id,
                doctor_id: prescriptionTarget.doctor_id,
                note: prescriptionUploadNote.trim() || null,
            }, prescriptionUploadFiles);

            setPrescriptionUploadFiles([]);
            setPrescriptionUploadNote('');
            await loadPrescriptionList(prescriptionTarget);
        } catch (error: any) {
            Alert.alert('Upload failed', getPrescriptionErrorMessage(error, 'Failed to upload prescription.'));
        } finally {
            setPrescriptionUploadLoading(false);
        }
    }, [loadPrescriptionList, prescriptionTarget, prescriptionUploadFiles, prescriptionUploadNote]);

    const handleDeletePrescription = useCallback((record: PrescriptionRecordItem) => {
        if (!prescriptionTarget) return;

        Alert.alert(
            'Delete prescription',
            'Delete this prescription and all of its uploaded pages?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deletePrescriptionRecord({
                                prescription_id: record.prescription_id,
                                patient_id: prescriptionTarget.patient_id,
                                doctor_id: prescriptionTarget.doctor_id,
                            });

                            if (selectedPrescription?.prescription_id === record.prescription_id) {
                                closePrescriptionViewer();
                            }

                            await loadPrescriptionList(prescriptionTarget);
                        } catch (error: any) {
                            Alert.alert('Delete failed', getPrescriptionErrorMessage(error, 'Failed to delete prescription.'));
                        }
                    },
                },
            ]
        );
    }, [closePrescriptionViewer, loadPrescriptionList, prescriptionTarget, selectedPrescription?.prescription_id]);

    useEffect(() => {
        const requestKey = route.params?.openPrescriptionRequestKey;
        const patientId = Number(route.params?.openPrescriptionPatientId || 0);
        const doctorId = Number(route.params?.openPrescriptionDoctorId || 0);
        const patientName = route.params?.openPrescriptionPatientName || 'Patient';

        if (!isFocused || !requestKey) return;
        if (lastHandledPrescriptionRequestRef.current === requestKey) return;
        if (!patientId || !doctorId) return;

        lastHandledPrescriptionRequestRef.current = requestKey;
        void loadPrescriptionList({
            patient_id: patientId,
            doctor_id: doctorId,
            patient_name: patientName,
        });
    }, [
        isFocused,
        loadPrescriptionList,
        route.params?.openPrescriptionDoctorId,
        route.params?.openPrescriptionPatientId,
        route.params?.openPrescriptionPatientName,
        route.params?.openPrescriptionRequestKey,
    ]);


    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#059669" />
                <Text className="text-gray-400 mt-3 text-sm">Loading patients...</Text>
            </View>
        );
    }

    const renderItem = ({ item, index }: { item: any; index: number }) => {
        const isNew = item.patient_type === 'NEW';
        const patientId = Number(item.patient_id);
        const hasUnread = unreadPatientIds.has(patientId);

        return (
            <AnimatedListItem index={index}>
                <View
                    className="bg-white rounded-2xl mb-4 overflow-hidden"
                    style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
                >
                    <View className="bg-emerald-900/90 px-3 py-2">
                        <View className="flex-row items-center">
                            <TouchableOpacity
                                onPress={() => navigation.navigate('PatientDetails', { patientId: item.patient_id })}
                                activeOpacity={0.8}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                className="bg-white w-8 h-8 rounded-full items-center justify-center mr-2.5 relative"
                            >
                                <User size={16} color="#043f2cff" />
                                {hasUnread && (
                                    <View className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 items-center justify-center border border-white">
                                        <Text className="text-white text-[8px] font-bold">!</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            <View className="flex-1">
                                <TouchableOpacity onPress={() => openPatientActionMenu(item)} activeOpacity={0.8}>
                                    <Text className="text-white font-bold text-base" numberOfLines={1}>
                                        {item.full_name || 'Unknown Patient'}
                                    </Text>
                                </TouchableOpacity>
                                <View className="flex-row items-center mt-0.5">
                                    <Text className="text-emerald-100 text-sm">
                                        {item.gender || 'N/A'} {' • '} {item.age ? `${item.age} yrs` : 'Age N/A'}
                                    </Text>
                                    <View className="flex-row items-center ml-2 flex-1">
                                        <Text className="text-emerald-100 text-sm mr-1">{'•'}</Text>
                                        <Phone size={10} color="#d1fae5" />
                                        <Text className="text-emerald-100 text-sm ml-1 flex-1" numberOfLines={1}>
                                            {item.phone || 'No phone'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <View className="flex-row items-center">
                                <TouchableOpacity
                                    onPress={() => handleOpenChat(item)}
                                    activeOpacity={0.85}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    className="bg-emerald-600 w-8 h-8 rounded-full items-center justify-center mr-2"
                                >
                                    <MessageCircle size={15} color="#ffffff" />
                                </TouchableOpacity>
                                <View className={`w-[54px] py-0.5 rounded-lg items-center ${isNew ? 'bg-emerald-200' : 'bg-emerald-800'}`}>
                                    <Text className={`text-[11px] font-bold text-center ${isNew ? 'text-emerald-800' : 'text-emerald-200'}`}>
                                        {item.patient_type || 'STANDARD'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {item.reason ? (
                        <View className="px-3 py-2.5">
                            <View className="flex-row items-start mb-1.5">
                                <View className="w-6 items-center mt-0.5"><Stethoscope size={13} color="#6b7280" /></View>
                                <Text className="text-gray-500 text-sm flex-1 ml-1" numberOfLines={2}>{item.reason}</Text>
                            </View>
                        </View>
                    ) : null}
                </View>
            </AnimatedListItem>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#047857' }} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#047857" />
            <View className="flex-1 bg-gray-50">
                <View className="bg-emerald-700 px-5 pt-6 pb-6" style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
                    <View className="flex-row justify-between items-center mb-5">
                        <View>
                            <Text className="text-white text-2xl font-bold">Patients Directory</Text>
                            <Text className="text-emerald-200 text-sm mt-1">
                                {patients.length} total patient{patients.length !== 1 ? 's' : ''}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setModalVisible(true)}
                            className="bg-white p-3 rounded-full"
                            style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}
                        >
                            <Plus size={22} color="#047857" />
                        </TouchableOpacity>

                    </View>

                    <View className="bg-emerald-600 rounded-xl px-4 py-3 flex-row items-center">
                        <User size={18} color="#a7f3d0" />
                        <TextInput
                            placeholder="Search patients by name or phone..."
                            placeholderTextColor="#a7f3d0"
                            className="flex-1 text-white ml-3 font-medium"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <X size={18} color="#a7f3d0" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <FlatList
                    data={filteredPatients}
                    keyExtractor={(item) => item.patient_id?.toString() || Math.random().toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} tintColor="#059669" />
                    }
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Users size={48} color="#9ca3af" />
                            <Text className="text-gray-500 font-semibold text-base mt-4">
                                {searchQuery ? 'No patients match your search' : 'No patients found'}
                            </Text>
                            <Text className="text-gray-400 text-sm mt-1 text-center px-6">
                                {searchQuery ? 'Try a different name or phone number' : 'Tap the + button to add your first patient'}
                            </Text>
                        </View>
                    }
                />
            </View>

            <Modal visible={patientActionVisible} transparent animationType="fade" onRequestClose={closePatientActionMenu}>
                <View className="flex-1 justify-end bg-black/45">
                    <TouchableOpacity className="flex-1" activeOpacity={1} onPress={closePatientActionMenu} />
                    <View className="rounded-t-3xl bg-white px-6 pt-5 pb-8">
                        <View className="flex-row items-start justify-between">
                            <View className="flex-1 pr-4">
                                <Text className="text-lg font-bold text-gray-900">
                                    {selectedPatientAction?.full_name || 'Patient'}
                                </Text>
                                <Text className="mt-1 text-sm text-gray-500">Choose what you want to open</Text>
                            </View>
                            <TouchableOpacity onPress={closePatientActionMenu} className="rounded-full bg-gray-100 p-2">
                                <X size={18} color="#4b5563" />
                            </TouchableOpacity>
                        </View>

                        <View className="mt-5" style={{ gap: 12 }}>
                            <TouchableOpacity
                                onPress={() => {
                                    const item = selectedPatientAction;
                                    closePatientActionMenu();
                                    if (item) {
                                        void loadAppointmentHistory(item);
                                    }
                                }}
                                className="rounded-2xl border border-gray-200 bg-white px-4 py-4"
                                activeOpacity={0.85}
                            >
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-row items-center flex-1">
                                        <View className="mr-3 rounded-2xl bg-emerald-50 p-3">
                                            <CalendarDays size={18} color="#047857" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-base font-bold text-gray-900">All Appointments</Text>
                                            <Text className="mt-1 text-sm text-gray-500">View full appointment history across clinics</Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={18} color="#9ca3af" />
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => {
                                    const item = selectedPatientAction;
                                    closePatientActionMenu();
                                    if (item) {
                                        openPrescriptionHistory(item);
                                    }
                                }}
                                className="rounded-2xl border border-gray-200 bg-white px-4 py-4"
                                activeOpacity={0.85}
                            >
                                <View className="flex-row items-center justify-between">
                                    <View className="flex-row items-center flex-1">
                                        <View className="mr-3 rounded-2xl bg-blue-50 p-3">
                                            <ImagePlus size={18} color="#1d4ed8" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-base font-bold text-gray-900">Prescription</Text>
                                            <Text className="mt-1 text-sm text-gray-500">Open prescription history and upload flow</Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={18} color="#9ca3af" />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={appointmentHistoryVisible} transparent animationType="slide" onRequestClose={closeAppointmentHistoryFlow}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-6 h-[88%]">
                            <View className="flex-row items-center justify-between mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-2xl font-bold text-gray-800">All Appointments</Text>
                                    <Text className="text-sm text-gray-500 mt-1">
                                        {appointmentHistoryTarget?.patient_name
                                            ? `${appointmentHistoryTarget.patient_name}'s appointment history`
                                            : 'Patient appointment history'}
                                    </Text>
                                </View>
                                <View className="flex-row items-center" style={{ gap: 10 }}>
                                    <TouchableOpacity
                                        onPress={() => { void refreshAppointmentHistory(); }}
                                        className="bg-gray-100 p-2 rounded-full"
                                        disabled={appointmentHistoryLoading || appointmentHistoryRefreshing}
                                    >
                                        <RefreshCcw size={18} color="#4b5563" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={closeAppointmentHistoryFlow} className="bg-gray-100 p-2 rounded-full">
                                        <X size={22} color="#4b5563" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {appointmentHistoryLoading ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 10, paddingRight: 8, paddingBottom: 7 }}>
                                    {[1, 2, 3].map((item) => (
                                        <View
                                            key={item}
                                            className="h-9 rounded-full bg-gray-200"
                                            style={{ width: item === 1 ? 92 : 132 }}
                                        />
                                    ))}
                                </ScrollView>
                            ) : (
                                <View className="mb-2 pb-0">
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={{ gap: 10, paddingRight: 8, paddingBottom: 4 }}
                                        style={{ overflow: 'visible', minHeight: 38, maxHeight: 38 }}
                                    >
                                        {clinicFilterOptions.map((clinic) => {
                                            const selected = selectedClinicFilter === clinic.key;
                                            return (
                                                <TouchableOpacity
                                                    key={clinic.key}
                                                    onPress={() => setSelectedClinicFilter(clinic.key)}
                                                    className={`shrink-0 items-center justify-center rounded-full border ${selected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-200'}`}
                                                    style={{ minHeight: 34, paddingHorizontal: 14, paddingVertical: 4 }}
                                                >
                                                    <Text
                                                        className={`font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}
                                                        style={{ fontSize: 11 }}
                                                        numberOfLines={1}
                                                    >
                                                        {clinic.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            )}

                            {!appointmentHistoryLoading && visibleAppointmentHistory.length > 0 ? (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    className="mb-2"
                                    contentContainerStyle={{ gap: 8, paddingRight: 8, paddingBottom: 2, alignItems: 'center' }}
                                    style={{ overflow: 'visible', minHeight: 30, maxHeight: 30 }}
                                >
                                    <View className="shrink-0 self-center items-center justify-center rounded-full bg-slate-100 px-3 py-1.5" style={{ minHeight: 28, minWidth: 82 }}>
                                        <Text className="font-semibold text-slate-700" style={{ fontSize: 11, lineHeight: 14, includeFontPadding: true }}>
                                            Total {appointmentHistorySummary.total}
                                        </Text>
                                    </View>
                                    <View className="shrink-0 self-center items-center justify-center rounded-full bg-emerald-50 px-3 py-1.5" style={{ minHeight: 28, minWidth: 92 }}>
                                        <Text className="font-semibold text-emerald-700" style={{ fontSize: 11, lineHeight: 14, includeFontPadding: true }}>
                                            Visited {appointmentHistorySummary.visited}
                                        </Text>
                                    </View>
                                    <View className="shrink-0 self-center items-center justify-center rounded-full bg-amber-50 px-3 py-1.5" style={{ minHeight: 28, minWidth: 114 }}>
                                        <Text className="font-semibold text-amber-700" style={{ fontSize: 11, lineHeight: 14, includeFontPadding: true }}>
                                            Not Visited {appointmentHistorySummary.notVisited}
                                        </Text>
                                    </View>
                                    <View className="shrink-0 self-center items-center justify-center rounded-full bg-rose-50 px-3 py-1.5" style={{ minHeight: 28, minWidth: 96 }}>
                                        <Text className="font-semibold text-rose-700" style={{ fontSize: 11, lineHeight: 14, includeFontPadding: true }}>
                                            Cancelled {appointmentHistorySummary.cancelled}
                                        </Text>
                                    </View>
                                </ScrollView>
                            ) : null}

                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                refreshControl={
                                    <RefreshControl
                                        refreshing={appointmentHistoryRefreshing}
                                        onRefresh={() => { void refreshAppointmentHistory(); }}
                                        colors={['#059669']}
                                        tintColor="#059669"
                                    />
                                }
                            >
                                {appointmentHistoryLoading ? (
                                    <View className="py-16 items-center justify-center">
                                        <ActivityIndicator size="large" color="#059669" />
                                        <Text className="text-sm text-gray-500 mt-3">Loading appointments...</Text>
                                    </View>
                                ) : appointmentHistoryError ? (
                                    <View className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
                                        <Text className="text-sm font-semibold text-red-700">{appointmentHistoryError}</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (selectedPatientAction) {
                                                    void loadAppointmentHistory(selectedPatientAction);
                                                } else if (appointmentHistoryTarget) {
                                                    void loadAppointmentHistory(appointmentHistoryTarget);
                                                }
                                            }}
                                            className="mt-3 self-start rounded-full border border-red-200 bg-white px-3 py-2"
                                        >
                                            <Text className="text-xs font-semibold text-red-700">Retry</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : visibleAppointmentHistory.length === 0 ? (
                                    <View className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-8 items-center">
                                        <CalendarDays size={28} color="#9ca3af" />
                                        <Text className="text-base font-semibold text-gray-700 mt-3">No appointments found</Text>
                                        <Text className="text-sm text-gray-500 mt-1 text-center">
                                            {selectedClinicFilter === 'ALL'
                                                ? 'This patient does not have appointment history yet.'
                                                : 'No appointments found for the selected clinic.'}
                                        </Text>
                                    </View>
                                ) : (
                                    visibleAppointmentHistory.map((appointment, index) => {
                                        const statusKey = String(appointment.status || 'BOOKED').toUpperCase();
                                        const statusStyle = STATUS_STYLES[statusKey] || {
                                            bg: 'bg-slate-100',
                                            text: 'text-slate-700',
                                            label: appointment.status || 'Booked',
                                        };

                                        return (
                                            <View
                                                key={appointment.appointment_id}
                                                className={`rounded-2xl border border-gray-200 bg-white px-4 py-3 ${index > 0 ? 'mt-2.5' : ''}`}
                                            >
                                                <View className="flex-row items-center justify-between">
                                                    <View className="flex-1 pr-3">
                                                        <Text className="text-sm text-gray-900">
                                                            Appointment No: <Text className="font-bold">{appointment.booking_id || appointment.appointment_id}</Text>
                                                        </Text>
                                                    </View>
                                                    <View className={`rounded-full px-3 py-1 ${statusStyle.bg}`}>
                                                        <Text className={`text-xs font-semibold ${statusStyle.text}`}>
                                                            {statusStyle.label}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View className="mt-3">
                                                    <Text className="text-sm font-semibold text-gray-900">
                                                        {formatAppointmentDateTimeLabel(appointment.appointment_date, appointment.start_time)}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={prescriptionVisible} transparent animationType="slide" onRequestClose={closePrescriptionFlow}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-6 h-[88%]">
                            <View className="flex-row justify-between items-center mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-2xl font-bold text-gray-800">Prescriptions</Text>
                                    <Text className="text-sm text-gray-500 mt-1">
                                        {prescriptionTarget?.patient_name
                                            ? `${prescriptionTarget.patient_name}'s prescription history`
                                            : 'Patient prescription history'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={closePrescriptionFlow} className="bg-gray-100 p-2 rounded-full">
                                    <X size={22} color="#4b5563" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <View className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
                                    <Text className="text-sm font-bold text-blue-900 mb-3">Upload Prescription</Text>
                                    <View className="flex-row" style={{ gap: 10 }}>
                                        <TouchableOpacity
                                            onPress={handlePickPrescriptionFromCamera}
                                            className="flex-1 rounded-xl bg-white border border-blue-200 items-center py-3"
                                            disabled={prescriptionUploadLoading}
                                        >
                                            <Camera size={16} color="#1d4ed8" />
                                            <Text className="text-blue-700 font-semibold mt-1.5">Camera</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handlePickPrescriptionFromGallery}
                                            className="flex-1 rounded-xl bg-white border border-blue-200 items-center py-3"
                                            disabled={prescriptionUploadLoading}
                                        >
                                            <ImagePlus size={16} color="#1d4ed8" />
                                            <Text className="text-blue-700 font-semibold mt-1.5">Gallery</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View className="mt-3 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                        <PrescriptionUploadPreviewGrid
                                            files={prescriptionUploadFiles}
                                            onRemove={removePrescriptionFileAt}
                                            removeDisabled={prescriptionUploadLoading}
                                        />
                                    </View>

                                    <TextInput
                                        className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-800 min-h-[96px]"
                                        placeholder="Add a short note (optional)"
                                        multiline
                                        textAlignVertical="top"
                                        value={prescriptionUploadNote}
                                        onChangeText={setPrescriptionUploadNote}
                                        editable={!prescriptionUploadLoading}
                                    />

                                    <TouchableOpacity
                                        onPress={handlePrescriptionUpload}
                                        className={`mt-4 rounded-2xl items-center justify-center py-3.5 ${prescriptionUploadLoading ? 'bg-blue-300' : 'bg-blue-600'}`}
                                        disabled={prescriptionUploadLoading}
                                    >
                                        {prescriptionUploadLoading ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text className="text-white font-bold text-base">Upload Prescription</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                {prescriptionLoading ? (
                                    <View className="py-16 items-center justify-center">
                                        <ActivityIndicator size="large" color="#2563eb" />
                                        <Text className="text-sm text-gray-500 mt-3">Loading prescriptions...</Text>
                                    </View>
                                ) : prescriptionError ? (
                                    <View className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
                                        <Text className="text-sm font-semibold text-red-700">{prescriptionError}</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (prescriptionTarget) {
                                                    void loadPrescriptionList(prescriptionTarget);
                                                }
                                            }}
                                            className="mt-3 self-start rounded-full border border-red-200 bg-white px-3 py-2"
                                        >
                                            <Text className="text-xs font-semibold text-red-700">Retry</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : prescriptionRecords.length === 0 ? (
                                    <View className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-8 items-center">
                                        <Text className="text-base font-semibold text-gray-700">No prescriptions uploaded yet.</Text>
                                    </View>
                                ) : (
                                    prescriptionRecords.map((record, index) => (
                                        <View
                                            key={record.prescription_id}
                                            className={index > 0 ? 'mt-3' : ''}
                                        >
                                            <PrescriptionHistoryCard
                                                record={record}
                                                uploaderLabel={formatPrescriptionUploader(record)}
                                                onView={() => {
                                                    setSelectedPrescription(record);
                                                    setPrescriptionViewerVisible(true);
                                                }}
                                                onDelete={() => handleDeletePrescription(record)}
                                            />
                                        </View>
                                    ))
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <PrescriptionImageViewerModal
                visible={prescriptionViewerVisible}
                prescription={selectedPrescription}
                onClose={closePrescriptionViewer}
            />

            {/* Add Patient Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                    className="flex-1"
                >
                    <View className="flex-1 justify-end bg-black/50">
                        <View className="bg-white rounded-t-3xl p-6 h-[85%]">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-2xl font-bold text-gray-800">Add Patient</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-gray-100 p-2 rounded-full">
                                    <X size={24} color="#4b5563" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View>
                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Full Name</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="John Doe"
                                            value={formData.full_name}
                                            onChangeText={(t) => setFormData({ ...formData, full_name: t })}
                                        />
                                    </View>

                                    <View className="flex-row mb-4">
                                        <View className="flex-1">
                                            <Text className="text-sm font-bold text-gray-700 mb-2">Age</Text>
                                            <TextInput
                                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                                placeholder="30"
                                                keyboardType="numeric"
                                                value={formData.age}
                                                onChangeText={(t) => setFormData({ ...formData, age: t })}
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-sm font-bold text-gray-700 mb-2">Gender</Text>
                                            <View className="flex-row rounded-xl border border-gray-200 overflow-hidden">
                                                {['MALE', 'FEMALE'].map((g) => (
                                                    <TouchableOpacity
                                                        key={g}
                                                        onPress={() => setFormData({ ...formData, gender: g })}
                                                        className={`flex-1 py-3.5 items-center ${formData.gender === g ? 'bg-emerald-100' : 'bg-gray-50'}`}
                                                    >
                                                        <Text className={`font-semibold text-xs ${formData.gender === g ? 'text-emerald-700' : 'text-gray-500'}`}>
                                                            {g.charAt(0)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                        <View className="w-4" />
                                    </View>

                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Phone Number</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base"
                                            placeholder="Enter phone number"
                                            keyboardType="phone-pad"
                                            value={formData.phone}
                                            onChangeText={(t) => setFormData({ ...formData, phone: t })}
                                        />
                                    </View>

                                    <View className="mb-4">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">Reason (Optional)</Text>
                                        <TextInput
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base h-24"
                                            placeholder="Brief description of symptoms/reason for visit"
                                            multiline
                                            textAlignVertical="top"
                                            value={formData.reason}
                                            onChangeText={(t) => setFormData({ ...formData, reason: t })}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        onPress={handleCreatePatient}
                                        disabled={submitting}
                                        className={`bg-emerald-600 rounded-2xl py-4 items-center mt-2 ${submitting ? 'opacity-70' : ''}`}
                                        style={{ shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                                    >
                                        {submitting ? (
                                            <ActivityIndicator color="white" />
                                        ) : (
                                            <Text className="text-white font-bold text-lg">Add Patient</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

export default Patients;
