import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, FlatList, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, CloudCheck, CloudUpload, Download, FileImage, FilePlus2, FileText, FlaskConical, Heart, ImagePlus, Info, MapPin, Pencil, RotateCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Users, X, ZoomIn, ZoomOut } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInUp, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Constants from 'expo-constants';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { useFocusEffect } from '@react-navigation/native';
import { getPatientProfile } from '../api/auth';
import { listPatientEmrPrescriptions, type PatientEmrPrescriptionItem } from '../api/patientEmrPrescriptions';
import { getToken } from '../api/token';
import { API_URL } from '../config/env';
import { type PatientRecord, type PatientRecordDraft, deletePatientRecord, listPatientRecords, uploadPatientRecord } from '../api/patientRecords';
import { pickPrescriptionImagesFromCamera, pickPrescriptionImagesFromLibrary, PRESCRIPTION_MAX_PAGE_COUNT } from '../lib/prescriptionImageUpload';
import { prepareUploadFile } from '../lib/uploadFilePreparation';

// react-native-pdf requires native modules that are not included in Expo Go.
// Keep its module out of Expo Go's runtime startup path; custom builds include it.
const Pdf = Constants.appOwnership === 'expo' ? null : require('react-native-pdf').default;
const ModalSafeAreaProvider = Platform.OS === 'ios' ? SafeAreaProvider : React.Fragment;

type Doctor = { doctor_id: number; doctor_name: string | null; specialization?: string | null };
type Category = PatientRecord['category'];
type RecordDateGroup = { key: string; label: string; records: PatientRecord[] };
type EmrDateGroup = { key: string; label: string; records: PatientEmrPrescriptionItem[] };
type PatientRecordsListRow =
    | { kind: 'saved'; key: string; group: RecordDateGroup }
    | { kind: 'emr-heading'; key: string }
    | { kind: 'emr-group'; key: string; group: EmrDateGroup; isLast: boolean };
const categories: { key: Category | 'ALL'; label: string; icon: typeof FileImage }[] = [
    { key: 'ALL', label: 'All', icon: FileImage },
    { key: 'PRESCRIPTION', label: 'Prescriptions', icon: FileImage },
    { key: 'LAB_REPORT', label: 'Lab reports', icon: FlaskConical },
    { key: 'IMAGING', label: 'Scans', icon: ImagePlus },
    { key: 'OTHER', label: 'Other', icon: FilePlus2 },
];
const queueFileFor = (patientId: number) => `${FileSystem.documentDirectory || ''}patient-record-upload-queue-${patientId}.json`;
const retryGateFileFor = (patientId: number) => `${FileSystem.documentDirectory || ''}patient-record-retry-gate-${patientId}.txt`;
const cacheFileFor = (patientId: number) => `${FileSystem.documentDirectory || ''}patient-record-image-cache-${patientId}.json`;
const recordsFileFor = (patientId: number) => `${FileSystem.documentDirectory || ''}patient-record-list-${patientId}.json`;
const localDirFor = (patientId: number) => `${FileSystem.documentDirectory || ''}patient-record-pages-${patientId}/`;
const AUTO_RETRY_LIMIT = 3;
const AUTO_RETRY_BATCH_LIMIT = 2;
const AUTO_RETRY_COOLDOWN_MS = 5 * 60_000;
const AUTO_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
const SEARCH_HINTS = [
    'Search by prescription title...',
    'Search by person or relation...',
    'Search by doctor name...',
    'Search by note...',
    'Search by prescription number...',
    'Search by complaint or diagnosis...',
];

const AnimatedSearchHint = React.memo(function AnimatedSearchHint() {
    const [hintIndex, setHintIndex] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setHintIndex((current) => (current + 1) % SEARCH_HINTS.length), 2600);
        return () => clearInterval(timer);
    }, []);
    return <Animated.Text key={hintIndex} entering={FadeInUp.duration(260)} numberOfLines={1} ellipsizeMode="tail" className="text-base text-slate-400">{SEARCH_HINTS[hintIndex]}</Animated.Text>;
});

const updateDraftAfterFailure = (draft: PatientRecordDraft, kind: 'initial' | 'automatic' | 'manual') => {
    if (kind === 'manual') return { ...draft, last_upload_error: 'Upload failed. Tap Retry when ready.' };
    if (kind === 'initial') {
        return { ...draft, auto_retry_count: 0, next_auto_retry_at: new Date(Date.now() + AUTO_RETRY_DELAYS_MS[0]).toISOString(), auto_retry_exhausted: false, last_upload_error: 'Upload pending.' };
    }
    return { ...draft, last_upload_error: draft.auto_retry_exhausted ? 'Automatic retries paused. Tap Retry to try again.' : 'Upload pending.' };
};

const reserveAutomaticRetry = (draft: PatientRecordDraft) => {
    const retryCount = Math.max(0, Number(draft.auto_retry_count) || 0) + 1;
    const exhausted = retryCount >= AUTO_RETRY_LIMIT;
    return {
        ...draft,
        auto_retry_count: retryCount,
        next_auto_retry_at: exhausted ? null : new Date(Date.now() + AUTO_RETRY_DELAYS_MS[retryCount]).toISOString(),
        auto_retry_exhausted: exhausted,
        last_upload_error: exhausted ? 'Automatic retries paused. Tap Retry to try again.' : 'Upload pending.',
    };
};

const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const coordinatesForPage = (page: PatientRecord['pages'][number] | null | undefined) => {
    if (page?.latitude == null || page.longitude == null) return null;
    const latitude = Number(page.latitude);
    const longitude = Number(page.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
};

const addressLabelFor = (address: Location.LocationGeocodedAddress | undefined) => {
    if (!address) return null;
    if (address.formattedAddress?.trim()) return address.formattedAddress.trim();
    const parts = [
        address.name,
        [address.streetNumber, address.street].filter(Boolean).join(' '),
        address.district,
        address.city,
        address.subregion,
        address.region,
        address.postalCode,
        address.country,
    ].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
    const uniqueParts = parts.filter((part, index) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index);
    return uniqueParts.length ? uniqueParts.join(', ') : null;
};

export default function PatientRecordsScreen() {
    const [records, setRecords] = useState<PatientRecord[]>([]);
    const [emrRecords, setEmrRecords] = useState<PatientEmrPrescriptionItem[]>([]);
    const [drafts, setDrafts] = useState<PatientRecordDraft[]>([]);
    const draftsRef = useRef<PatientRecordDraft[]>([]);
    const uploadInFlightRef = useRef(new Set<string>());
    const [retryingDraftIds, setRetryingDraftIds] = useState<Set<string>>(new Set());
    const [localCache, setLocalCache] = useState<Record<string, string[]>>({});
    const localCacheRef = useRef<Record<string, string[]>>({});
    const [failedLocalImageKeys, setFailedLocalImageKeys] = useState<Set<string>>(new Set());
    const doctorsRef = useRef<Doctor[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [ownerPatientId, setOwnerPatientId] = useState<number | null>(null);
    const ownerPatientIdRef = useRef<number | null>(null);
    const [imageToken, setImageToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const emrRequestIdRef = useRef(0);
    const [selectedCategory, setSelectedCategory] = useState<Category | 'ALL'>('ALL');
    const [personFilter, setPersonFilter] = useState('ALL');
    const [doctorFilter, setDoctorFilter] = useState<string[]>([]);
    const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST' | 'TITLE'>('NEWEST');
    const [filterSheetVisible, setFilterSheetVisible] = useState(false);
    const [draftPersonFilter, setDraftPersonFilter] = useState('ALL');
    const [draftDoctorFilter, setDraftDoctorFilter] = useState<string[]>([]);
    const [draftSortOrder, setDraftSortOrder] = useState<'NEWEST' | 'OLDEST' | 'TITLE'>('NEWEST');
    const [query, setQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [composerVisible, setComposerVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingRecordIds, setDeletingRecordIds] = useState<Set<string>>(new Set());
    const [cameraBusy, setCameraBusy] = useState(false);
    const [personLabel, setPersonLabel] = useState('Self');
    const [relationship, setRelationship] = useState('');
    const [customRelationship, setCustomRelationship] = useState(false);
    const [category, setCategory] = useState<Category>('PRESCRIPTION');
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [doctorId, setDoctorId] = useState<number | null>(null);
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const [files, setFiles] = useState<{ uri: string; name: string; type: string }[]>([]);
    const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
    const [locationBusy, setLocationBusy] = useState(false);
    const [locationUnavailable, setLocationUnavailable] = useState(false);
    const locationRequestIdRef = useRef(0);
    const [selectedRecord, setSelectedRecord] = useState<PatientRecord | null>(null);
    const [selectedEmrPrescription, setSelectedEmrPrescription] = useState<PatientEmrPrescriptionItem | null>(null);
    const [emrViewerUrl, setEmrViewerUrl] = useState<string | null>(null);
    const [emrViewerLoading, setEmrViewerLoading] = useState(false);
    const [emrViewerError, setEmrViewerError] = useState<string | null>(null);
    const [emrViewerPageCount, setEmrViewerPageCount] = useState(0);
    const [emrViewerCurrentPage, setEmrViewerCurrentPage] = useState(1);
    const [exportVisible, setExportVisible] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [exportIncludeSaved, setExportIncludeSaved] = useState(true);
    const [exportIncludeEmr, setExportIncludeEmr] = useState(false);
    const [exportAllDoctors, setExportAllDoctors] = useState(true);
    const [exportDoctorIds, setExportDoctorIds] = useState<number[]>([]);
    const [exportIncludePersonal, setExportIncludePersonal] = useState(true);
    const [exportPerson, setExportPerson] = useState('ALL');
    const [exportCategory, setExportCategory] = useState<Category | 'ALL'>('ALL');
    const [exportCustomDates, setExportCustomDates] = useState(true);
    const [exportStartDate, setExportStartDate] = useState(() => { const today = new Date(); today.setHours(0, 0, 0, 0); return today; });
    const [exportEndDate, setExportEndDate] = useState(() => { const today = new Date(); today.setHours(0, 0, 0, 0); return today; });
    const [exportDatePicker, setExportDatePicker] = useState<'start' | 'end' | null>(null);
    const [selectedPage, setSelectedPage] = useState(0);
    const [imageZoom, setImageZoom] = useState(1);
    const imageScale = useSharedValue(1);
    const savedImageScale = useSharedValue(1);
    const animatedImageStyle = useAnimatedStyle(() => ({ transform: [{ scale: imageScale.value }] }));
    const [locationPage, setLocationPage] = useState<PatientRecord['pages'][number] | null>(null);
    const [locationAddress, setLocationAddress] = useState<string | null>(null);
    const [locationAddressLoading, setLocationAddressLoading] = useState(false);
    const locationLookupIdRef = useRef(0);
    const locationAddressCacheRef = useRef(new Map<string, string>());

    const persistDrafts = useCallback(async (next: PatientRecordDraft[], patientId: number) => {
        await FileSystem.writeAsStringAsync(queueFileFor(patientId), JSON.stringify(next));
        if (ownerPatientIdRef.current === patientId) {
            draftsRef.current = next;
            setDrafts(next);
        }
    }, []);

    const cacheUploadedPages = useCallback(async (recordId: string, paths: string[], patientId: number) => {
        try {
            let patientCache = localCacheRef.current;
            if (ownerPatientIdRef.current !== patientId) {
                try {
                    const storedCache = JSON.parse(await FileSystem.readAsStringAsync(cacheFileFor(patientId)) || '{}');
                    patientCache = storedCache && typeof storedCache === 'object' ? storedCache : {};
                } catch { patientCache = {}; }
            }
            const next = { ...patientCache, [recordId]: paths };
            let freeBytes = await FileSystem.getFreeDiskStorageAsync();
            if (freeBytes < 200 * 1024 * 1024) {
                for (const oldId of Object.keys(next)) {
                    if (oldId === recordId) continue;
                    await Promise.all((next[oldId] || []).map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)));
                    delete next[oldId];
                    freeBytes = await FileSystem.getFreeDiskStorageAsync().catch(() => freeBytes);
                    if (freeBytes >= 300 * 1024 * 1024) break;
                }
            }
            while (Object.keys(next).length > 20) {
                const oldest = Object.keys(next).find((id) => id !== recordId);
                if (!oldest) break;
                await Promise.all((next[oldest] || []).map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)));
                delete next[oldest];
            }
            await FileSystem.writeAsStringAsync(cacheFileFor(patientId), JSON.stringify(next));
            if (ownerPatientIdRef.current === patientId) {
                localCacheRef.current = next;
                setLocalCache(next);
            }
        } catch {
            // Keep upload success independent from local cache maintenance.
        }
    }, []);

    const refresh = useCallback(async (showSpinner = true) => {
        const requestOwnerId = ownerPatientIdRef.current;
        if (showSpinner) setRefreshing(true);
        const emrRequestId = ++emrRequestIdRef.current;
        const doctorList = doctorsRef.current;
        if (doctorList.length) {
            void Promise.allSettled(doctorList.map((doctor) => listPatientEmrPrescriptions({ doctor_id: doctor.doctor_id })))
                .then((histories) => {
                    if (emrRequestId !== emrRequestIdRef.current) return;
                    setEmrRecords(histories.flatMap((result) => result.status === 'fulfilled' ? result.value.prescriptions : []));
                });
        } else {
            setEmrRecords([]);
        }
        try {
            const data = await listPatientRecords();
            if (requestOwnerId !== ownerPatientIdRef.current) return;
            setRecords(data);
            if (requestOwnerId) void FileSystem.writeAsStringAsync(recordsFileFor(requestOwnerId), JSON.stringify(data)).catch(() => undefined);
        } catch (error: any) {
            if (requestOwnerId !== ownerPatientIdRef.current) return;
            if (requestOwnerId) {
                try {
                    const cachedRecords = JSON.parse(await FileSystem.readAsStringAsync(recordsFileFor(requestOwnerId)) || '[]');
                    if (requestOwnerId !== ownerPatientIdRef.current) return;
                    if (Array.isArray(cachedRecords)) { setRecords(cachedRecords); return; }
                } catch { /* no offline metadata cache */ }
            }
            Alert.alert('Records unavailable', error?.message || 'Please try again.');
        } finally {
            if (requestOwnerId === ownerPatientIdRef.current) {
                setRefreshing(false);
                setLoading(false);
            }
        }
    }, []);

    const persistFailure = useCallback(async (draft: PatientRecordDraft, kind: 'initial' | 'automatic' | 'manual', patientId: number) => {
        let patientDrafts = draftsRef.current;
        if (ownerPatientIdRef.current !== patientId) {
            try {
                const storedDrafts = JSON.parse(await FileSystem.readAsStringAsync(queueFileFor(patientId)) || '[]');
                patientDrafts = Array.isArray(storedDrafts) ? storedDrafts : [];
            } catch { patientDrafts = []; }
        }
        const current = patientDrafts.find((item) => item.local_id === draft.local_id) || draft;
        const updated = updateDraftAfterFailure(current, kind);
        const next = patientDrafts.map((item) => item.local_id === draft.local_id ? updated : item);
        if (!next.some((item) => item.local_id === draft.local_id)) next.push(updated);
        await persistDrafts(next, patientId);
    }, [persistDrafts]);

    const uploadQueuedDraft = useCallback(async (draft: PatientRecordDraft, kind: 'initial' | 'automatic' | 'manual', patientId: number) => {
        if (uploadInFlightRef.current.has(draft.local_id)) return false;
        uploadInFlightRef.current.add(draft.local_id);
        let uploadDraft = draft;
        try {
            if (kind === 'automatic') {
                uploadDraft = reserveAutomaticRetry(draft);
                const reservedQueue = draftsRef.current.map((item) => item.local_id === draft.local_id ? uploadDraft : item);
                try { await persistDrafts(reservedQueue, patientId); } catch { return false; }
            }
            setRetryingDraftIds((current) => new Set(current).add(draft.local_id));
            try {
                await uploadPatientRecord(uploadDraft);
                await cacheUploadedPages(uploadDraft.local_id, uploadDraft.files.map((file) => file.uri), patientId);
                let patientDrafts = draftsRef.current;
                if (ownerPatientIdRef.current !== patientId) {
                    try {
                        const storedDrafts = JSON.parse(await FileSystem.readAsStringAsync(queueFileFor(patientId)) || '[]');
                        patientDrafts = Array.isArray(storedDrafts) ? storedDrafts : [];
                    } catch { patientDrafts = []; }
                }
                const next = patientDrafts.filter((item) => item.local_id !== draft.local_id);
                await persistDrafts(next, patientId);
                await refresh(false);
                return true;
            } catch {
                await persistFailure(uploadDraft, kind, patientId).catch(() => undefined);
                return false;
            } finally {
                setRetryingDraftIds((current) => { const next = new Set(current); next.delete(draft.local_id); return next; });
            }
        } finally {
            uploadInFlightRef.current.delete(draft.local_id);
        }
    }, [cacheUploadedPages, persistDrafts, persistFailure, refresh]);

    useFocusEffect(useCallback(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            ownerPatientIdRef.current = null;
            setOwnerPatientId(null);
            setRecords([]);
            setEmrRecords([]);
            setDrafts([]);
            setLocalCache({});
            localCacheRef.current = {};
            setFailedLocalImageKeys(new Set());
            emrRequestIdRef.current += 1;
            const [tokenResult, profileResult] = await Promise.allSettled([getToken(), getPatientProfile()]);
            const token = tokenResult.status === 'fulfilled' ? tokenResult.value : null;
            if (active) setImageToken(token);
            if (!active) return;
            let pending: PatientRecordDraft[] = [];
            let currentOwnerId: number | null = null;
            if (profileResult.status === 'fulfilled') {
                const resolvedOwnerId = Number(profileResult.value?.patient?.patient_id);
                if (resolvedOwnerId && Number.isInteger(resolvedOwnerId)) {
                    currentOwnerId = resolvedOwnerId;
                    ownerPatientIdRef.current = resolvedOwnerId;
                    setOwnerPatientId(currentOwnerId);
                    const [pendingResult, cachedPagesResult, cachedRecordsResult] = await Promise.allSettled([
                        FileSystem.readAsStringAsync(queueFileFor(currentOwnerId)),
                        FileSystem.readAsStringAsync(cacheFileFor(currentOwnerId)),
                        FileSystem.readAsStringAsync(recordsFileFor(currentOwnerId)),
                    ]);
                    if (pendingResult.status === 'fulfilled') {
                        try { pending = JSON.parse(pendingResult.value || '[]'); } catch { pending = []; }
                    }
                    if (cachedPagesResult.status === 'fulfilled') {
                        try {
                            const cachedPages = JSON.parse(cachedPagesResult.value || '{}');
                            localCacheRef.current = cachedPages;
                            setLocalCache(cachedPages);
                        } catch { localCacheRef.current = {}; setLocalCache({}); }
                    } else { localCacheRef.current = {}; setLocalCache({}); }
                    if (cachedRecordsResult.status === 'fulfilled') {
                        try {
                            const cachedRecords = JSON.parse(cachedRecordsResult.value || 'null');
                            if (Array.isArray(cachedRecords)) {
                                setRecords(cachedRecords);
                                setLoading(false);
                            }
                        } catch { /* fetch the current record list below */ }
                    }
                }
                const list = (profileResult.value?.doctors || []) as Doctor[];
                const byId = new Map<number, Doctor>();
                list.forEach((doctor) => { if (doctor?.doctor_id) byId.set(Number(doctor.doctor_id), doctor); });
                const doctorList = Array.from(byId.values());
                doctorsRef.current = doctorList;
                setDoctors(doctorList);
            }
            const safePending = Array.isArray(pending) ? pending : [];
            draftsRef.current = safePending;
            setDrafts(safePending);
            await refresh(false);
            if (!active) return;
            // Retry only due uploads, with at most three automatic retries per record.
            if (currentOwnerId) {
                const dueDrafts = pending.filter((draft) => {
                    const retryCount = Math.max(0, Number(draft.auto_retry_count) || 0);
                    const dueAt = draft.next_auto_retry_at ? new Date(draft.next_auto_retry_at).getTime() : 0;
                    return draft.owner_patient_id === currentOwnerId && !draft.auto_retry_exhausted && retryCount < AUTO_RETRY_LIMIT && dueAt <= Date.now();
                });
                let lastBatchAt = 0;
                try { lastBatchAt = Number(await FileSystem.readAsStringAsync(retryGateFileFor(currentOwnerId))) || 0; } catch { lastBatchAt = 0; }
                if (dueDrafts.length && Date.now() - lastBatchAt >= AUTO_RETRY_COOLDOWN_MS) {
                    // Save the cooldown first so quick screen reopenings or an app restart cannot start a retry loop.
                    try { await FileSystem.writeAsStringAsync(retryGateFileFor(currentOwnerId), String(Date.now())); } catch { return; }
                    let automaticAttemptsThisOpen = 0;
                    for (const draft of dueDrafts) {
                        if (automaticAttemptsThisOpen >= AUTO_RETRY_BATCH_LIMIT) break;
                        if (!active) break;
                        automaticAttemptsThisOpen += 1;
                        await uploadQueuedDraft(draft, 'automatic', currentOwnerId);
                    }
                }
            }
        };
        void load();
        return () => { active = false; };
    }, [persistDrafts, refresh, uploadQueuedDraft]));

    const relationFilterOptions = useMemo(() => Array.from(new Set(records
        .map((record) => record.relationship_label?.trim())
        .filter((label): label is string => Boolean(label))))
        .sort((left, right) => left.localeCompare(right)), [records]);
    const doctorFilterOptions = useMemo(() => {
        const names = new Map<number, string>();
        doctors.forEach((doctor) => names.set(Number(doctor.doctor_id), doctor.doctor_name || 'Doctor'));
        records.forEach((record) => {
            if (record.doctor_id != null) names.set(Number(record.doctor_id), record.doctor_name || names.get(Number(record.doctor_id)) || 'Doctor');
        });
        return Array.from(names, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
    }, [doctors, records]);
    const activeFilterCount = Number(personFilter !== 'ALL') + Number(doctorFilter.length > 0) + Number(sortOrder !== 'NEWEST');
    const openFilterSheet = () => {
        setDraftPersonFilter(personFilter);
        setDraftDoctorFilter([...doctorFilter]);
        setDraftSortOrder(sortOrder);
        setFilterSheetVisible(true);
    };
    const toggleDraftDoctorFilter = (key: string) => {
        if (key === 'ALL') {
            setDraftDoctorFilter([]);
            return;
        }
        setDraftDoctorFilter((current) => current.includes(key)
            ? current.filter((item) => item !== key)
            : [...current, key]);
    };
    const visibleRecords = useMemo(() => records.filter((record) => {
        const matchesCategory = selectedCategory === 'ALL' || record.category === selectedCategory;
        const isSelf = record.for_label.trim().toLowerCase() === 'self';
        const relation = (record.relationship_label || '').trim().toLowerCase();
        const matchesPerson = personFilter === 'ALL'
            || (personFilter === 'SELF' && isSelf)
            || (personFilter === 'OTHER' && !isSelf)
            || (personFilter.startsWith('RELATION:') && relation === personFilter.slice('RELATION:'.length));
        const matchesDoctor = doctorFilter.length === 0
            || (record.doctor_id == null ? doctorFilter.includes('PERSONAL') : doctorFilter.includes(`DOCTOR:${Number(record.doctor_id)}`));
        const text = `${record.title || ''} ${record.for_label} ${record.relationship_label || ''} ${record.doctor_name || ''} ${record.note || ''}`.toLowerCase();
        return matchesCategory && matchesPerson && matchesDoctor && (!query.trim() || text.includes(query.trim().toLowerCase()));
    }), [doctorFilter, personFilter, query, records, selectedCategory]);
    const visibleRecordGroups = useMemo(() => {
        if (sortOrder === 'TITLE') {
            const sorted = [...visibleRecords].sort((left, right) => (left.title || '').localeCompare(right.title || '') || left.created_at.localeCompare(right.created_at));
            return sorted.length ? [{ key: 'title-a-z', label: 'Title A–Z', records: sorted }] : [];
        }
        const groups = new Map<string, RecordDateGroup>();
        const direction = sortOrder === 'NEWEST' ? -1 : 1;
        const sortedRecords = [...visibleRecords].sort((left, right) => direction * (new Date(left.created_at).getTime() - new Date(right.created_at).getTime()));
        sortedRecords.forEach((record) => {
            const date = new Date(record.created_at);
            const key = Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (!groups.has(key)) groups.set(key, { key, label: key === 'unknown' ? 'Date unavailable' : formatDate(record.created_at), records: [] });
            groups.get(key)!.records.push(record);
        });
        return Array.from(groups.values());
    }, [sortOrder, visibleRecords]);
    const visibleEmrRecords = useMemo(() => {
        if (selectedCategory !== 'ALL' && selectedCategory !== 'PRESCRIPTION') return [];
        if (personFilter !== 'ALL' && personFilter !== 'SELF') return [];
        return emrRecords.filter((record) => (doctorFilter.length === 0 || doctorFilter.includes(`DOCTOR:${Number(record.doctor_id)}`))
            && (!query.trim() || `${record.doctor_name || ''} ${record.prescription_no || ''} ${record.complaint_summary || ''} ${record.diagnosis_summary || ''}`.toLowerCase().includes(query.trim().toLowerCase())));
    }, [doctorFilter, emrRecords, personFilter, query, selectedCategory]);
    const visibleEmrGroups = useMemo(() => {
        if (sortOrder === 'TITLE') {
            const sorted = [...visibleEmrRecords].sort((left, right) => (left.doctor_name || '').localeCompare(right.doctor_name || '') || left.prescription_no.localeCompare(right.prescription_no));
            return sorted.length ? [{ key: 'title-a-z', label: 'Doctor A–Z', records: sorted }] : [];
        }
        const groups = new Map<string, EmrDateGroup>();
        const direction = sortOrder === 'NEWEST' ? -1 : 1;
        const sortedRecords = [...visibleEmrRecords].sort((left, right) => {
            const leftTime = new Date(left.finalized_at || left.visit_date).getTime();
            const rightTime = new Date(right.finalized_at || right.visit_date).getTime();
            return direction * ((Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0));
        });
        sortedRecords.forEach((record) => {
            const value = record.finalized_at || record.visit_date;
            const date = new Date(value);
            const key = Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const label = key === 'unknown' ? 'Date unavailable' : formatDate(value);
            if (!groups.has(key)) groups.set(key, { key, label, records: [] });
            groups.get(key)!.records.push(record);
        });
        return Array.from(groups.values());
    }, [sortOrder, visibleEmrRecords]);
    const listRows = useMemo<PatientRecordsListRow[]>(() => {
        // Remount saved-record rows when the category changes so each filter starts at its left edge.
        const filterKey = `${selectedCategory}-${personFilter}-${doctorFilter.join(',')}-${sortOrder}`;
        const rows: PatientRecordsListRow[] = visibleRecordGroups.map((group) => ({ kind: 'saved', key: `saved-${filterKey}-${group.key}`, group }));
        if (visibleEmrGroups.length) {
            rows.push({ kind: 'emr-heading', key: `emr-heading-${filterKey}` });
            visibleEmrGroups.forEach((group, index) => rows.push({ kind: 'emr-group', key: `emr-${filterKey}-${group.key}`, group, isLast: index === visibleEmrGroups.length - 1 }));
        }
        return rows;
    }, [doctorFilter, personFilter, selectedCategory, sortOrder, visibleEmrGroups, visibleRecordGroups]);

    const resetComposer = () => {
        locationRequestIdRef.current += 1;
        setPersonLabel('Self'); setRelationship(''); setCustomRelationship(false); setCategory('PRESCRIPTION'); setTitle(''); setNote(''); setDoctorId(null); setFiles([]); setCoordinates(null); setLocationUnavailable(false); setLocationBusy(false); setDetailsExpanded(false);
    };

    const appendFiles = (next: { uri: string; name: string; type: string }[]) => {
        setFiles((current) => [...current, ...next].slice(0, PRESCRIPTION_MAX_PAGE_COUNT));
    };

    const takePhoto = async () => {
        if (files.length >= PRESCRIPTION_MAX_PAGE_COUNT) return Alert.alert('Page limit', `Add up to ${PRESCRIPTION_MAX_PAGE_COUNT} pages.`);
        setCameraBusy(true);
        try {
            const result = await pickPrescriptionImagesFromCamera();
            if (!result.ok) return Alert.alert('Camera unavailable', result.error);
            appendFiles(result.files);
        } finally { setCameraBusy(false); }
    };

    const choosePhotos = async () => {
        const remaining = PRESCRIPTION_MAX_PAGE_COUNT - files.length;
        const result = await pickPrescriptionImagesFromLibrary(remaining);
        if (!result.ok) return Alert.alert('Photos unavailable', result.error);
        appendFiles(result.files);
    };

    const captureOptionalLocation = async () => {
        const requestId = ++locationRequestIdRef.current;
        setCoordinates(null);
        setLocationBusy(true);
        setLocationUnavailable(false);
        try {
            let permission = await Location.getForegroundPermissionsAsync();
            if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
            if (!permission.granted) { if (requestId === locationRequestIdRef.current) setLocationUnavailable(true); return; }
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (requestId === locationRequestIdRef.current) setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? null });
        } catch {
            if (requestId === locationRequestIdRef.current) setLocationUnavailable(true);
        } finally { if (requestId === locationRequestIdRef.current) setLocationBusy(false); }
    };

    const openComposer = () => {
        resetComposer();
        setComposerVisible(true);
        void captureOptionalLocation();
    };

    const closeComposer = () => {
        if (saving) return;
        resetComposer();
        setComposerVisible(false);
    };

    const saveRecord = async () => {
        if (!files.length) return Alert.alert('Add images', 'Take a photo or choose images to continue.');
        if (personLabel.trim().toLowerCase() === 'other' && !relationship.trim()) return Alert.alert('Add a label', 'Add a relationship, such as Sister or Father.');
        if (!ownerPatientId) return Alert.alert('Account unavailable', 'Please reopen My Records and try again.');
        setSaving(true);
        const localId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => { const random = Math.floor(Math.random() * 16); return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16); });
        const savedFiles: PatientRecordDraft['files'] = [];
        let persistedToQueue = false;
        try {
            const dir = localDirFor(ownerPatientId);
            const dirInfo = await FileSystem.getInfoAsync(dir);
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
            for (const [index, file] of files.entries()) {
                const source = await prepareUploadFile({ uri: file.uri, fileName: file.name, mimeType: file.type }, { fallbackBaseName: `record_${index + 1}`, fallbackMimeType: 'image/jpeg', optimizeImage: true, maxLongEdgePx: 1600, jpegQuality: 0.72 });
                const target = `${dir}${localId}_${index + 1}.jpg`;
                await FileSystem.copyAsync({ from: source.uri, to: target });
                savedFiles.push({ uri: target, name: source.name, type: source.mimeType });
            }
            const draft: PatientRecordDraft = {
                local_id: localId, owner_patient_id: ownerPatientId, title, category, for_label: personLabel.trim(), relationship_label: personLabel.trim().toLowerCase() === 'other' ? relationship.trim() : '',
                doctor_id: doctorId, note, files: savedFiles, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
                location_accuracy_m: coordinates?.accuracy ?? null, created_at: new Date().toISOString(), auto_retry_count: 0,
                next_auto_retry_at: new Date(Date.now() + AUTO_RETRY_DELAYS_MS[0]).toISOString(), auto_retry_exhausted: false,
            };
            // Persist the images and metadata before attempting the network upload.
            await persistDrafts([...draftsRef.current, draft], ownerPatientId);
            persistedToQueue = true;
            // The durable local copy is the save point; cloud backup continues after closing.
            setComposerVisible(false);
            resetComposer();
            void uploadQueuedDraft(draft, 'initial', ownerPatientId);
        } catch (error: any) {
            if (!persistedToQueue) await Promise.all(savedFiles.map((file) => FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined)));
            Alert.alert('Could not save images', error?.message || 'Please choose the images again.');
        } finally { setSaving(false); }
    };

    const retryDraft = async (draft: PatientRecordDraft) => {
        if (!ownerPatientId || draft.owner_patient_id !== ownerPatientId) return;
        if (uploadInFlightRef.current.has(draft.local_id)) return;
        const succeeded = await uploadQueuedDraft(draft, 'manual', ownerPatientId);
        if (!succeeded) Alert.alert('Upload pending', 'Your images are still saved on this device. Try again when ready.');
    };

    const confirmDeleteRecord = (record: PatientRecord) => {
        Alert.alert('Delete saved record?', 'This will permanently delete the record and its images.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { void (async () => {
                setDeletingRecordIds((current) => new Set(current).add(record.record_id));
                try {
                    await deletePatientRecord(record.record_id);
                    setRecords((current) => current.filter((item) => item.record_id !== record.record_id));
                    const nextCache = { ...localCacheRef.current };
                    const cachedFiles = nextCache[record.record_id] || [];
                    delete nextCache[record.record_id];
                    localCacheRef.current = nextCache;
                    setLocalCache(nextCache);
                    if (ownerPatientIdRef.current) await FileSystem.writeAsStringAsync(cacheFileFor(ownerPatientIdRef.current), JSON.stringify(nextCache)).catch(() => undefined);
                    await Promise.all(cachedFiles.map((path) => FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)));
                } catch (error: any) {
                    Alert.alert('Could not delete record', error?.message || 'Please try again.');
                } finally {
                    setDeletingRecordIds((current) => { const next = new Set(current); next.delete(record.record_id); return next; });
                }
            })(); } },
        ]);
    };

    const toggleExportDoctor = (doctorId: number) => {
        setExportDoctorIds((current) => current.includes(doctorId)
            ? current.filter((id) => id !== doctorId)
            : [...current, doctorId]);
    };
    const formatExportDate = (date: Date) => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const exportDateParam = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const setExportDatesToToday = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setExportStartDate(today);
        setExportEndDate(today);
        setExportCustomDates(true);
    };
    const onExportDateChange = (event: DateTimePickerEvent, value?: Date) => {
        setExportDatePicker(null);
        if (event.type === 'set' && value) {
            if (exportDatePicker === 'start') setExportStartDate(value);
            else if (exportDatePicker === 'end') setExportEndDate(value);
        }
    };
    const saveExportFile = async (bytes: ArrayBuffer, filename: string, mimeType: string) => {
        if (Platform.OS === 'web') {
            const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
            return;
        }
        const tempUri = `${FileSystem.cacheDirectory}dapto-export-${Date.now()}-${filename}`;
        await FileSystem.writeAsStringAsync(tempUri, Buffer.from(bytes).toString('base64'), { encoding: FileSystem.EncodingType.Base64 });
        try {
            if (Platform.OS === 'android') {
                const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!permission.granted) return Alert.alert('Download cancelled', 'Choose a folder to save your records.');
                let destination: string;
                try {
                    destination = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, filename, mimeType);
                } catch (error: any) {
                    if (!/already exists/i.test(String(error?.message || error))) throw error;
                    const dot = filename.lastIndexOf('.');
                    const uniqueName = `${dot > 0 ? filename.slice(0, dot) : filename}_${Date.now()}${dot > 0 ? filename.slice(dot) : ''}`;
                    destination = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, uniqueName, mimeType);
                }
                const base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
                await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
                Alert.alert('Download complete', `Saved ${filename}`);
            } else {
                const destination = `${FileSystem.documentDirectory}${filename}`;
                await FileSystem.copyAsync({ from: tempUri, to: destination });
                Alert.alert('Download complete', `Saved ${filename} in Dapto app files.`);
            }
        } finally {
            await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => undefined);
        }
    };
    const downloadRecords = async () => {
        if (!exportIncludeSaved && !exportIncludeEmr) return Alert.alert('Choose records', 'Select saved records, doctor prescriptions, or both.');
        if (!exportAllDoctors && exportDoctorIds.length === 0 && ((exportIncludeSaved && !exportIncludePersonal) || exportIncludeEmr)) {
            return Alert.alert('Choose a doctor', 'Select one or more doctors, or choose All doctors.');
        }
        if (exportCustomDates && exportStartDate > exportEndDate) return Alert.alert('Check date range', 'The start date must be before the end date.');
        const token = await getToken();
        if (!token) return Alert.alert('Sign in required', 'Please sign in again before downloading records.');
        setExportBusy(true);
        try {
            const startDate = exportCustomDates ? exportDateParam(exportStartDate) : null;
            const endDate = exportCustomDates ? exportDateParam(exportEndDate) : null;
            let response: Response;
            try {
                response = await fetch(`${API_URL}/patient/records/export`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        includeSaved: exportIncludeSaved,
                        includeDoctorPrescriptions: exportIncludeEmr,
                        allDoctors: exportAllDoctors,
                        doctorIds: exportAllDoctors ? [] : exportDoctorIds,
                        includePersonal: exportIncludePersonal,
                        person: exportPerson,
                        category: exportCategory,
                        startDate,
                        endDate,
                    }),
                });
            } catch {
                throw new Error('Could not reach the Dapto server. Check your internet connection and try again.');
            }
            if (!response.ok) {
                const responseText = await response.text().catch(() => '');
                let message = '';
                try { const body = JSON.parse(responseText); if (typeof body?.error === 'string') message = body.error; } catch { /* non-JSON server response */ }
                if (!message && response.status === 404) message = 'The records download service is not available on this server yet. Update the Dapto server and try again.';
                else if (!message && response.status === 401) message = 'Your session has expired. Sign in again, then retry the download.';
                else if (!message && response.status === 413) message = 'This download is too large for one request. Narrow the date range or choose fewer records.';
                else if (!message) message = `The server could not create the download (HTTP ${response.status}). Please try again.`;
                throw new Error(message);
            }
            const mimeType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
            if (mimeType !== 'application/pdf' && mimeType !== 'application/zip') throw new Error('The server returned an unexpected file. Please try again.');
            const disposition = response.headers.get('content-disposition') || '';
            const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
            const filename = (filenameMatch?.[1] || (mimeType === 'application/zip' ? 'Dapto_Records.zip' : 'Health_Record.pdf')).replace(/[\\/:*?"<>|]/g, '_');
            const bytes = await response.arrayBuffer();
            const contentLength = Number(response.headers.get('content-length') || 0);
            const fileBytes = new Uint8Array(bytes);
            const signature = Array.from(fileBytes.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
            const hasPdfSignature = fileBytes.length >= 4 && fileBytes[0] === 0x25 && fileBytes[1] === 0x50 && fileBytes[2] === 0x44 && fileBytes[3] === 0x46;
            const hasZipSignature = fileBytes.length >= 2 && fileBytes[0] === 0x50 && fileBytes[1] === 0x4b;
            const invalidFile = !bytes.byteLength || (mimeType === 'application/pdf' && !hasPdfSignature) || (mimeType === 'application/zip' && !hasZipSignature);
            const incompleteFile = contentLength > 0 && contentLength !== bytes.byteLength;
            if (invalidFile || incompleteFile) {
                if (__DEV__) console.warn('[patient-records-export] Invalid download body', { mimeType, receivedBytes: bytes.byteLength, contentLength: contentLength || null, signature });
                throw new Error('The download did not finish correctly. Please retry with a stable connection.');
            }
            setExportVisible(false);
            await saveExportFile(bytes, filename, mimeType);
        } catch (error: any) {
            Alert.alert('Download failed', error?.message || 'Could not create the download. Please try again.');
        } finally {
            setExportBusy(false);
        }
    };

    const resetImageZoom = () => {
        imageScale.value = withTiming(1);
        savedImageScale.value = 1;
        setImageZoom(1);
    };
    const setImageZoomLevel = (level: number) => {
        const next = Math.min(3, Math.max(1, level));
        imageScale.value = withTiming(next);
        savedImageScale.value = next;
        setImageZoom(next);
    };
    const imagePinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            imageScale.value = Math.min(3, Math.max(1, savedImageScale.value * event.scale));
        })
        .onEnd(() => {
            savedImageScale.value = imageScale.value;
            runOnJS(setImageZoom)(imageScale.value);
        });
    const openRecord = (record: PatientRecord) => { setSelectedRecord(record); setSelectedPage(0); resetImageZoom(); };
    const loadEmrPrescriptionPdf = async (prescription: PatientEmrPrescriptionItem) => {
        if (!Pdf) {
            setEmrViewerError('Prescription preview isn’t available in Expo Go. Install the latest Dapto app to view it here.');
            setEmrViewerLoading(false);
            return;
        }
        setEmrViewerLoading(true);
        setEmrViewerError(null);
        setEmrViewerUrl(null);
        setEmrViewerPageCount(0);
        setEmrViewerCurrentPage(1);
        try {
            // The PDF URL token expires after 15 minutes; request a fresh scoped URL each time it opens.
            const response = await listPatientEmrPrescriptions({ doctor_id: prescription.doctor_id });
            const current = response.prescriptions.find((item) => item.prescription_id === prescription.prescription_id);
            if (!current?.view_url) throw new Error('Prescription PDF is unavailable.');
            setEmrViewerUrl(current.view_url);
        } catch {
            setEmrViewerError('Could not load this prescription. Check your connection and try again.');
            setEmrViewerLoading(false);
        }
    };
    const openEmrPrescription = (prescription: PatientEmrPrescriptionItem) => {
        setSelectedEmrPrescription(prescription);
        setEmrViewerError(null);
        setEmrViewerLoading(Boolean(Pdf));
        void loadEmrPrescriptionPdf(prescription);
    };
    const closeEmrPrescription = () => {
        setSelectedEmrPrescription(null);
        setEmrViewerUrl(null);
        setEmrViewerError(null);
    };
    const changeSelectedPage = (delta: number) => {
        setSelectedPage((value) => Math.max(0, Math.min((selectedRecord?.pages.length || 1) - 1, value + delta)));
        resetImageZoom();
    };
    const openLocation = async (page: PatientRecord['pages'][number]) => {
        const coordinates = coordinatesForPage(page);
        if (!coordinates) return;
        const lookupId = ++locationLookupIdRef.current;
        const cacheKey = `${coordinates.latitude.toFixed(5)},${coordinates.longitude.toFixed(5)}`;
        setLocationPage(page);
        setLocationAddress(null);
        const cachedAddress = locationAddressCacheRef.current.get(cacheKey);
        if (cachedAddress) {
            setLocationAddress(cachedAddress);
            setLocationAddressLoading(false);
            return;
        }
        setLocationAddressLoading(true);
        try {
            const [result] = await Location.reverseGeocodeAsync(coordinates);
            const address = addressLabelFor(result);
            if (lookupId === locationLookupIdRef.current && address) {
                locationAddressCacheRef.current.set(cacheKey, address);
                setLocationAddress(address);
            }
        } catch {
            // Address lookup is best-effort; keep the saved coordinates available as a fallback.
        } finally {
            if (lookupId === locationLookupIdRef.current) setLocationAddressLoading(false);
        }
    };
    const closeLocation = () => {
        locationLookupIdRef.current += 1;
        setLocationPage(null);
        setLocationAddress(null);
        setLocationAddressLoading(false);
    };
    const openCoordinatesInMap = async () => {
        if (!locationPageCoordinates) return;
        const { latitude, longitude } = locationPageCoordinates;
        const url = Platform.OS === 'ios'
            ? `https://maps.apple.com/?ll=${latitude},${longitude}`
            : `https://maps.google.com/?q=${latitude},${longitude}`;
        try {
            await Linking.openURL(url);
        } catch {
            Alert.alert('Unable to open map', `Coordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
    };
    const currentPage = selectedRecord?.pages[selectedPage];
    const currentPageCoordinates = coordinatesForPage(currentPage);
    const locationPageCoordinates = coordinatesForPage(locationPage);
    const ownerLabel = (label: string, relation: string | null) => label.toLowerCase() === 'self' ? 'Self' : `${relation || label}`;
    const localImageFailureKey = (recordId: string, page: PatientRecord['pages'][number], uri: string) => `${recordId}:${page.page_number}:${uri}`;
    const imageSourceFor = (recordId: string, page: PatientRecord['pages'][number] | undefined) => {
        if (!page) return undefined;
        const localUri = localCache[recordId]?.[Number(page.page_number) - 1];
        if (localUri && !failedLocalImageKeys.has(localImageFailureKey(recordId, page, localUri))) return { uri: localUri };
        return { uri: `${API_URL}${page.image_path}`, headers: imageToken ? { Authorization: `Bearer ${imageToken}` } : undefined };
    };
    const handleRecordImageError = (recordId: string, page: PatientRecord['pages'][number] | undefined) => {
        if (!page) return;
        const localUri = localCache[recordId]?.[Number(page.page_number) - 1];
        if (!localUri) return;
        const key = localImageFailureKey(recordId, page, localUri);
        setFailedLocalImageKeys((current) => current.has(key) ? current : new Set(current).add(key));
    };
    const savedRecordsHeading = visibleRecordGroups.length ? <View className="mb-2 mt-1 flex-row items-center justify-between"><Text className="text-base font-bold text-slate-900">Your saved records</Text><Text className="text-xs text-slate-500">{visibleRecords.length}</Text></View> : null;

    const renderListRow = ({ item: row }: { item: PatientRecordsListRow }) => {
        if (row.kind === 'emr-heading') return <View className="mt-3 flex-row items-center justify-between rounded-t-3xl bg-indigo-50 px-4 pb-4 pt-4"><View className="flex-row items-center"><View className="mr-2 h-9 w-9 items-center justify-center rounded-xl bg-white"><FileText size={18} color="#4f46e5" /></View><View><Text className="font-bold text-slate-900">Doctor prescriptions</Text><Text className="text-xs text-slate-500">From your clinic visits</Text></View></View><Text className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">{visibleEmrRecords.length}</Text></View>;
        if (row.kind === 'emr-group') return <View className={`bg-indigo-50 px-4 ${row.isLast ? 'mb-5 rounded-b-3xl pb-4' : 'pb-2'}`}><View className="mb-2 flex-row items-center"><CalendarDays size={13} color="#64748b" /><Text className="ml-1.5 text-xs font-semibold text-slate-500">{row.group.label}</Text></View><FlatList<PatientEmrPrescriptionItem> horizontal data={row.group.records} keyExtractor={(item) => `emr-${item.prescription_id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={3} renderItem={({ item }) => <TouchableOpacity onPress={() => openEmrPrescription(item)} className="w-64 rounded-2xl border border-indigo-100 bg-white p-3.5"><View className="flex-row items-start justify-between"><View className="mr-2 h-8 w-8 items-center justify-center rounded-xl bg-indigo-50"><FileText size={16} color="#4f46e5" /></View><Text className="flex-1 pt-1 text-right text-xs font-semibold text-slate-400" numberOfLines={1}>{item.prescription_no || 'Prescription'}</Text></View><Text className="mt-2 font-bold text-slate-900" numberOfLines={1}>Dr. {item.doctor_name || 'Doctor'}</Text>{item.clinic_name ? <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>{item.clinic_name}</Text> : null}{item.diagnosis_summary ? <Text className="mt-2 text-xs leading-5 text-slate-600" numberOfLines={2}>{item.diagnosis_summary}</Text> : <Text className="mt-2 text-xs text-slate-400">Tap to view visit prescription</Text>}<Text className="mt-3 text-xs font-semibold text-indigo-700">View prescription</Text></TouchableOpacity>} /></View>;

        const { group } = row;
        return <View className="mb-3"><View className="mb-2 flex-row items-center"><CalendarDays size={13} color="#64748b" /><Text className="ml-1.5 text-xs font-semibold text-slate-500">{group.label}</Text></View><FlatList<PatientRecord> horizontal data={group.records} keyExtractor={(item) => item.record_id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} initialNumToRender={3} maxToRenderPerBatch={4} windowSize={3} renderItem={({ item }) => {
            const deleting = deletingRecordIds.has(item.record_id);
            return <View style={{ width: 152 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><View style={{ width: 152, height: 132 }}><TouchableOpacity disabled={deleting} activeOpacity={0.82} onPress={() => openRecord(item)} accessibilityLabel={`Open ${item.title || 'saved record'}`}><Image source={imageSourceFor(item.record_id, item.pages[0])} onError={() => handleRecordImageError(item.record_id, item.pages[0])} style={{ width: 152, height: 132 }} className="bg-slate-100" resizeMode="cover" /></TouchableOpacity><TouchableOpacity disabled={deleting} accessibilityLabel="Delete saved record" onPress={() => confirmDeleteRecord(item)} className="absolute right-2 top-2 rounded-full bg-white p-2 shadow-sm">{deleting ? <ActivityIndicator size="small" color="#64748b" /> : <Trash2 size={15} color="#b91c1c" />}</TouchableOpacity><TouchableOpacity accessibilityLabel="Backed up to cloud" onPress={() => Alert.alert('Backed up to cloud', 'This record is already saved in the cloud. No duplicate upload is needed.')} className="absolute left-2 top-2 rounded-full bg-white p-2 shadow-sm"><CloudCheck size={15} color="#4f46e5" /></TouchableOpacity><View className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1"><Text className="text-[10px] font-semibold text-white">{item.pages.length} {item.pages.length === 1 ? 'page' : 'pages'}</Text></View></View><TouchableOpacity activeOpacity={0.75} onPress={() => openRecord(item)} className="px-2.5 py-2"><Text className="text-xs font-semibold leading-4 text-slate-800" numberOfLines={2}>{item.title || categories.find((option) => option.key === item.category)?.label || 'Health record'}</Text><Text className="mt-1 text-[11px] text-slate-500" numberOfLines={1}>{ownerLabel(item.for_label, item.relationship_label)}</Text><View className="mt-2 flex-row items-center justify-between border-t border-slate-100 pt-2"><Text className="text-[11px] font-semibold text-indigo-600">Open record</Text><ChevronRight size={14} color="#4f46e5" /></View></TouchableOpacity></View>;
        }} /></View>;
    };

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
            <View className="px-5 pt-3 pb-4 bg-white border-b border-slate-100">
                <View className="flex-row items-center justify-between">
                    <View><Text className="text-2xl font-bold text-slate-900">My Records</Text><Text className="text-slate-500 mt-1">Your health documents, all in one place</Text></View>
                    <View className="flex-row items-center gap-2"><TouchableOpacity onPress={() => setExportVisible(true)} className="h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50" accessibilityLabel="Download records"><Download size={21} color="#4f46e5" /></TouchableOpacity><TouchableOpacity onPress={openComposer} className="h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600" accessibilityLabel="Add record"><FilePlus2 size={22} color="white" /></TouchableOpacity></View>
                </View>
                <View className="mt-4 w-full flex-row items-center rounded-xl bg-slate-100 px-3" style={{ width: '100%' }}><Search size={17} color="#64748b" /><TextInput value={query} onChangeText={setQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} placeholder="" className="flex-1 px-2 py-3 text-slate-800" style={{ flex: 1, minWidth: 0 }} />{query.length > 0 ? <TouchableOpacity accessibilityLabel="Clear search" onPress={() => setQuery('')} className="ml-1 rounded-full p-2"><X size={16} color="#64748b" /></TouchableOpacity> : null}<View pointerEvents="none" className="absolute bottom-0 top-0 justify-center" style={{ left: 37, right: query.length > 0 ? 46 : 12 }}>{!query && !searchFocused ? <AnimatedSearchHint /> : null}</View></View>
                <View className="mt-3 flex-row items-center">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                        {categories.map((item) => {
                            const Icon = item.icon; const active = selectedCategory === item.key;
                            return <TouchableOpacity key={item.key} onPress={() => setSelectedCategory(item.key)} className={`flex-row items-center rounded-full px-3.5 py-2 ${active ? 'bg-indigo-600' : 'bg-slate-100'}`}><Icon size={14} color={active ? 'white' : '#475569'} /><Text className={`ml-1.5 text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text></TouchableOpacity>;
                        })}
                    </ScrollView>
                    <TouchableOpacity accessibilityLabel="Filter and sort records" onPress={openFilterSheet} className={`ml-2 h-10 flex-row items-center rounded-full border px-3 ${activeFilterCount ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                        <SlidersHorizontal size={16} color={activeFilterCount ? '#4f46e5' : '#475569'} />
                        <Text className={`ml-1.5 text-xs font-semibold ${activeFilterCount ? 'text-indigo-700' : 'text-slate-600'}`}>Filter</Text>
                        {activeFilterCount ? <Text className="ml-1.5 h-5 min-w-5 rounded-full bg-indigo-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{activeFilterCount}</Text> : null}
                    </TouchableOpacity>
                </View>
            </View>
            {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#4f46e5" /><Text className="text-slate-500 mt-3">Loading records...</Text></View> : (
                <FlatList<PatientRecordsListRow>
                    data={listRows}
                    keyExtractor={(item) => item.key}
                    renderItem={renderListRow}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
                    refreshing={refreshing}
                    onRefresh={() => void refresh()}
                    ListHeaderComponent={<View>
                        {drafts.length ? <View className="mb-4">{drafts.map((draft) => {
                            const retrying = retryingDraftIds.has(draft.local_id);
                            return <View key={draft.local_id} className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <View className="flex-row items-center">
                                    <View className="flex-1"><Text className="font-semibold text-amber-900">{retrying ? 'Backing up...' : draft.auto_retry_exhausted ? 'Backup paused' : 'Waiting for cloud backup'}</Text><Text className="mt-1 text-xs text-amber-800">Saved on this device - {draft.files.length} {draft.files.length === 1 ? 'page' : 'pages'}</Text></View>
                                    <TouchableOpacity disabled={retrying} onPress={() => void retryDraft(draft)} className="flex-row items-center rounded-xl border border-amber-200 bg-white px-3 py-2"><RotateCw size={14} color="#92400e" /><Text className="ml-1 text-xs font-semibold text-amber-900">{retrying ? 'Backing up' : 'Retry'}</Text></TouchableOpacity>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
                                    {draft.files.map((file, index) => <View key={`${draft.local_id}-${index}`} className="h-20 w-16 overflow-hidden rounded-lg bg-white">
                                        <Image source={{ uri: file.uri }} style={{ width: 64, height: 80 }} resizeMode="cover" />
                                        <TouchableOpacity disabled={retrying} accessibilityLabel={`Retry cloud backup for page ${index + 1}`} onPress={() => void retryDraft(draft)} className="absolute left-1 top-1 rounded-full bg-white p-1.5">
                                            {retrying ? <ActivityIndicator size="small" color="#92400e" /> : <CloudUpload size={14} color="#92400e" />}
                                        </TouchableOpacity>
                                    </View>)}
                                </ScrollView>
                            </View>;
                        })}</View> : null}
                        {savedRecordsHeading}
                    </View>}
                    ListEmptyComponent={visibleRecords.length || visibleEmrRecords.length || drafts.length ? null : <View className="flex-1 items-center justify-center px-8 py-16"><View className="h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50"><FileImage size={28} color="#4f46e5" /></View><Text className="mt-4 text-lg font-bold text-slate-900">No records yet</Text><Text className="mt-2 text-center text-slate-500">Save prescriptions, lab reports and scans here.</Text><TouchableOpacity onPress={openComposer} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3"><Text className="font-semibold text-white">Add your first record</Text></TouchableOpacity></View>}
                />
            )}

            <Modal visible={composerVisible} animationType="slide" onRequestClose={closeComposer}>
                <ModalSafeAreaProvider>
                <SafeAreaView className="flex-1 bg-slate-50">
                    <View className="flex-row items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
                        <View className="flex-row items-center"><View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-amber-50"><FilePlus2 size={21} color="#d97706" /></View><View><Text className="text-lg font-bold text-slate-900">Save a health document</Text><Text className="mt-0.5 text-xs text-slate-500">Your private health library</Text></View></View>
                        <TouchableOpacity disabled={saving} onPress={closeComposer} className="rounded-full bg-slate-100 p-2"><X size={20} color="#475569" /></TouchableOpacity>
                    </View>
                    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 24 }}>
                            <View className="mb-3 flex-row items-center rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                                <ShieldCheck size={17} color="#4f46e5" /><Text className="ml-2 text-xs font-medium text-indigo-800">Private to your account · backup continues after saving</Text>
                            </View>

                            <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                                <View className="mb-3 flex-row items-center justify-between"><View><Text className="font-bold text-slate-900">Add pages</Text><Text className="mt-0.5 text-xs text-slate-500">Camera or gallery · up to {PRESCRIPTION_MAX_PAGE_COUNT} pages</Text></View><Text className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{files.length}/{PRESCRIPTION_MAX_PAGE_COUNT}</Text></View>
                                {!files.length ? <View className="mb-3 items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5"><FileImage size={26} color="#64748b" /><Text className="mt-2 font-semibold text-slate-700">Add pages</Text><Text className="mt-1 text-center text-xs leading-5 text-slate-500">Take photos or choose existing ones.</Text></View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>{files.map((file, index) => <View key={`${file.uri}-${index}`} className="h-[112px] w-[88px] overflow-hidden rounded-xl"><Image source={{ uri: file.uri }} className="h-[112px] w-[88px] bg-slate-100" resizeMode="cover" /><View className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5"><Text className="text-[10px] font-semibold text-white">Page {index + 1}</Text></View><TouchableOpacity accessibilityLabel={`Remove page ${index + 1}`} onPress={() => setFiles((current) => current.filter((_, page) => page !== index))} className="absolute right-1 top-1 z-10 rounded-full bg-slate-900 p-1.5"><X size={12} color="white" /></TouchableOpacity></View>)}</ScrollView>}
                                <View className="flex-row gap-2"><TouchableOpacity disabled={cameraBusy || files.length >= PRESCRIPTION_MAX_PAGE_COUNT} onPress={() => void takePhoto()} className={`flex-1 flex-row items-center justify-center rounded-2xl py-3.5 ${files.length >= PRESCRIPTION_MAX_PAGE_COUNT ? 'bg-indigo-300' : 'bg-indigo-600'}`}><Camera size={17} color="white" /><Text className="ml-2 font-semibold text-white">{cameraBusy ? 'Opening camera…' : 'Take photo'}</Text></TouchableOpacity><TouchableOpacity disabled={files.length >= PRESCRIPTION_MAX_PAGE_COUNT} onPress={() => void choosePhotos()} className="flex-1 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-white py-3.5"><ImagePlus size={17} color="#334155" /><Text className="ml-2 font-semibold text-slate-700">Choose photos</Text></TouchableOpacity></View>
                            </View>

                            <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                                <Text className="font-bold text-slate-900">What are you saving?</Text><Text className="mt-0.5 text-xs text-slate-500">Choose the closest match</Text>
                                <View className="mt-3 flex-row flex-wrap gap-2">{categories.filter((item) => item.key !== 'ALL').map((item) => { const Icon = item.icon; const active = category === item.key; return <TouchableOpacity key={item.key} onPress={() => setCategory(item.key as Category)} className={`flex-row items-center rounded-xl border px-3 py-2.5 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Icon size={15} color={active ? '#4f46e5' : '#64748b'} /><Text className={`ml-1.5 text-xs font-semibold ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{item.label}</Text></TouchableOpacity>; })}</View>
                            </View>

                            <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                                <Text className="font-bold text-slate-900">Whose record is this</Text>
                                <View className="mt-3 flex-row gap-2"><TouchableOpacity onPress={() => { setPersonLabel('Self'); setRelationship(''); setCustomRelationship(false); }} className={`flex-1 flex-row items-center justify-center rounded-2xl border py-3 ${personLabel === 'Self' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Heart size={16} color={personLabel === 'Self' ? '#4f46e5' : '#64748b'} /><Text className={`ml-2 font-semibold ${personLabel === 'Self' ? 'text-indigo-700' : 'text-slate-600'}`}>Myself</Text></TouchableOpacity><TouchableOpacity onPress={() => setPersonLabel('Other')} className={`flex-1 flex-row items-center justify-center rounded-2xl border py-3 ${personLabel === 'Other' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Users size={16} color={personLabel === 'Other' ? '#4f46e5' : '#64748b'} /><Text className={`ml-2 font-semibold ${personLabel === 'Other' ? 'text-indigo-700' : 'text-slate-600'}`}>Someone else</Text></TouchableOpacity></View>
                                {personLabel === 'Other' ? <><View className="mt-3 flex-row flex-wrap gap-2">{['Mother', 'Father', 'Sister', 'Brother', 'Spouse', 'Son', 'Daughter', 'Grandparent'].map((relation) => <TouchableOpacity key={relation} onPress={() => { setRelationship(relation); setCustomRelationship(false); }} className={`rounded-full border px-3 py-2 ${relationship === relation && !customRelationship ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${relationship === relation && !customRelationship ? 'text-indigo-700' : 'text-slate-600'}`}>{relation}</Text></TouchableOpacity>)}<TouchableOpacity onPress={() => { setRelationship(''); setCustomRelationship(true); }} className={`rounded-full border px-3 py-2 ${customRelationship ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Pencil size={14} color={customRelationship ? '#4f46e5' : '#64748b'} /></TouchableOpacity></View>{customRelationship ? <View className="mt-3 flex-row items-center rounded-xl border border-slate-200 bg-slate-50"><TextInput value={relationship} onChangeText={(value) => setRelationship(value.replace(/[^a-zA-Z ]/g, '').slice(0, 50))} placeholder="Enter relationship" autoCapitalize="words" className="flex-1 px-4 py-3 text-slate-800" maxLength={50} /><TouchableOpacity accessibilityLabel="Clear relationship" onPress={() => setRelationship('')} className="mr-2 rounded-full p-2"><X size={16} color="#64748b" /></TouchableOpacity></View> : null}</> : null}
                            </View>

                            <TouchableOpacity onPress={() => setDetailsExpanded((value) => !value)} className="mb-3 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5"><View><Text className="font-semibold text-slate-800">Add details</Text><Text className="mt-0.5 text-xs text-slate-500">Title, note, doctor · all optional</Text></View><ChevronDown size={18} color="#64748b" style={{ transform: [{ rotate: detailsExpanded ? '180deg' : '0deg' }] }} /></TouchableOpacity>
                            {detailsExpanded ? <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4"><View className="flex-row items-center rounded-xl border border-slate-200 bg-slate-50"><TextInput value={title} onChangeText={(value) => setTitle(value.replace(/[^a-zA-Z ]/g, '').slice(0, 50))} placeholder="Title (optional)" className="flex-1 px-4 py-3 text-slate-800" maxLength={50} /><TouchableOpacity accessibilityLabel="Clear title" onPress={() => setTitle('')} className="mr-2 rounded-full p-2"><X size={16} color="#64748b" /></TouchableOpacity></View><View className="mb-2 mt-4 flex-row items-center justify-between"><Text className="font-semibold text-slate-800">Doctor or clinic (optional)</Text><TouchableOpacity accessibilityLabel="About doctor visibility" onPress={() => Alert.alert('About record visibility', 'Choosing a doctor adds their name as a label. It does not share this record with them; the record stays in your My Records.')} className="rounded-full p-1"><Info size={16} color="#64748b" /></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><TouchableOpacity onPress={() => setDoctorId(null)} className={`rounded-full border px-3 py-2 ${doctorId === null ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${doctorId === null ? 'text-indigo-700' : 'text-slate-600'}`}>Personal record</Text></TouchableOpacity>{doctors.map((doctor) => <TouchableOpacity key={doctor.doctor_id} onPress={() => setDoctorId(doctor.doctor_id)} className={`rounded-full border px-3 py-2 ${doctorId === doctor.doctor_id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${doctorId === doctor.doctor_id ? 'text-indigo-700' : 'text-slate-600'}`}>Dr. {doctor.doctor_name || 'Doctor'}</Text></TouchableOpacity>)}</ScrollView><View className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><Text className="text-xs leading-5 text-slate-500">{doctorId === null ? 'Personal record: saved in your My Records.' : 'Doctor selected as a label only; this does not share the record with them.'}</Text></View><View className="mt-3 rounded-xl border border-slate-200 bg-slate-50"><View className="flex-row items-start"><TextInput value={note} onChangeText={setNote} placeholder="Add a note (optional)" multiline className="min-h-[76px] flex-1 px-4 py-3 text-slate-800" maxLength={500} /><TouchableOpacity accessibilityLabel="Clear note" onPress={() => setNote('')} className="mr-2 mt-2 rounded-full p-2"><X size={16} color="#64748b" /></TouchableOpacity></View><Text className="mb-2 mr-3 self-end text-[11px] text-slate-400">{note.length}/500</Text></View></View> : null}

                            <View className="mb-3 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3"><View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-slate-100"><MapPin size={17} color={coordinates ? '#4f46e5' : '#64748b'} /></View><View className="flex-1"><Text className="text-sm font-semibold text-slate-800">Location tag · optional</Text><Text className="mt-0.5 text-xs text-slate-500">{locationBusy ? 'Checking permission and location…' : coordinates ? 'Location added' : locationUnavailable ? 'Not added' : 'Added when available'}</Text></View>{locationBusy ? <ActivityIndicator size="small" color="#4f46e5" /> : coordinates ? <Check size={17} color="#16a34a" /> : null}</View>
                        </ScrollView>
                        <View className="border-t border-slate-200 bg-white px-5 pb-3 pt-3"><TouchableOpacity disabled={saving || !files.length} onPress={() => void saveRecord()} className={`flex-row items-center justify-center rounded-2xl py-4 ${saving || !files.length ? 'bg-indigo-300' : 'bg-indigo-600'}`}>{saving ? <><ActivityIndicator color="white" /><Text className="ml-2 font-bold text-white">Saving on this device…</Text></> : <><Check size={18} color="white" /><Text className="ml-2 font-bold text-white">{files.length ? `Save ${files.length} ${files.length === 1 ? 'page' : 'pages'}` : 'Add pages to continue'}</Text></>}</TouchableOpacity></View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
                </ModalSafeAreaProvider>
            </Modal>
            <Modal visible={filterSheetVisible} transparent animationType="slide" onRequestClose={() => setFilterSheetVisible(false)}>
                <View className="flex-1 justify-end bg-black/40">
                    <TouchableOpacity accessibilityLabel="Close filters" onPress={() => setFilterSheetVisible(false)} className="absolute inset-0" />
                    <SafeAreaView edges={['bottom']} className="max-h-[85%] rounded-t-3xl bg-white">
                        <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
                            <View><Text className="text-lg font-bold text-slate-900">Filter & sort</Text><Text className="mt-0.5 text-xs text-slate-500">Narrow your records</Text></View>
                            <TouchableOpacity accessibilityLabel="Close filters" onPress={() => setFilterSheetVisible(false)} className="rounded-full bg-slate-100 p-2"><X size={18} color="#475569" /></TouchableOpacity>
                        </View>
                        <ScrollView className="px-5" contentContainerStyle={{ paddingTop: 18, paddingBottom: 20 }}>
                            <Text className="mb-2.5 text-sm font-bold text-slate-800">Whose record</Text>
                            <View className="mb-5 flex-row flex-wrap gap-2">
                                {[{ key: 'ALL', label: 'Everyone' }, { key: 'SELF', label: 'Myself' }, { key: 'OTHER', label: 'Other' }, ...relationFilterOptions.map((label) => ({ key: `RELATION:${label.toLowerCase()}`, label }))].map((option) => {
                                    const active = draftPersonFilter === option.key;
                                    return <TouchableOpacity key={option.key} onPress={() => setDraftPersonFilter(option.key)} className={`rounded-full border px-3.5 py-2 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{option.label}</Text></TouchableOpacity>;
                                })}
                            </View>
                            <Text className="mb-2.5 text-sm font-bold text-slate-800">Doctor</Text>
                            <Text className="-mt-1 mb-2.5 text-xs text-slate-500">Choose one or more doctors</Text>
                            <View className="mb-5 flex-row flex-wrap gap-2">
                                <TouchableOpacity onPress={() => toggleDraftDoctorFilter('ALL')} className={`flex-row items-center rounded-full border px-3.5 py-2 ${draftDoctorFilter.length === 0 ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><View className={`mr-1.5 h-4 w-4 items-center justify-center rounded border ${draftDoctorFilter.length === 0 ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>{draftDoctorFilter.length === 0 ? <Check size={11} color="white" /> : null}</View><Text className={`text-xs font-semibold ${draftDoctorFilter.length === 0 ? 'text-indigo-700' : 'text-slate-600'}`} numberOfLines={1}>Any doctor</Text></TouchableOpacity>
                                {[{ key: 'PERSONAL', label: 'Personal record' }, ...doctorFilterOptions.map((doctor) => ({ key: `DOCTOR:${doctor.id}`, label: `Dr. ${doctor.name}` }))].map((option) => {
                                    const active = draftDoctorFilter.includes(option.key);
                                    return <TouchableOpacity key={option.key} onPress={() => toggleDraftDoctorFilter(option.key)} className={`flex-row items-center rounded-full border px-3.5 py-2 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><View className={`mr-1.5 h-4 w-4 items-center justify-center rounded border ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>{active ? <Check size={11} color="white" /> : null}</View><Text className={`text-xs font-semibold ${active ? 'text-indigo-700' : 'text-slate-600'}`} numberOfLines={1}>{option.label}</Text></TouchableOpacity>;
                                })}
                            </View>
                            <Text className="mb-2.5 text-sm font-bold text-slate-800">Sort by</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {([{ key: 'NEWEST', label: 'Newest first' }, { key: 'OLDEST', label: 'Oldest first' }, { key: 'TITLE', label: 'Title A–Z' }] as const).map((option) => {
                                    const active = draftSortOrder === option.key;
                                    return <TouchableOpacity key={option.key} onPress={() => setDraftSortOrder(option.key)} className={`rounded-full border px-3.5 py-2 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{option.label}</Text></TouchableOpacity>;
                                })}
                            </View>
                        </ScrollView>
                        <View className="flex-row gap-3 border-t border-slate-100 px-5 py-3">
                            <TouchableOpacity onPress={() => { setDraftPersonFilter('ALL'); setDraftDoctorFilter([]); setDraftSortOrder('NEWEST'); }} className="flex-1 items-center justify-center rounded-2xl border border-slate-200 py-3.5"><Text className="font-semibold text-slate-700">Clear</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => { setPersonFilter(draftPersonFilter); setDoctorFilter([...draftDoctorFilter]); setSortOrder(draftSortOrder); setFilterSheetVisible(false); }} className="flex-1 items-center justify-center rounded-2xl bg-indigo-600 py-3.5"><Text className="font-semibold text-white">Apply filters</Text></TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
            <Modal visible={exportVisible} animationType="slide" onRequestClose={() => !exportBusy && setExportVisible(false)}>
                <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'bottom']}>
                    <View className="flex-row items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
                        <View><Text className="text-xl font-bold text-slate-900">Download records</Text><Text className="mt-1 text-xs text-slate-500">Choose what to include and who it is for</Text></View>
                        <TouchableOpacity disabled={exportBusy} onPress={() => setExportVisible(false)} className="rounded-full bg-slate-100 p-2"><X size={20} color="#475569" /></TouchableOpacity>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
                        <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                            <Text className="mb-3 font-bold text-slate-900">Include</Text>
                            {([
                                ['Saved records', exportIncludeSaved, setExportIncludeSaved],
                                ["Doctor's prescriptions", exportIncludeEmr, setExportIncludeEmr],
                            ] as const).map(([label, checked, setChecked]) => <TouchableOpacity key={label} onPress={() => setChecked(!checked)} className="mb-2 flex-row items-center rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"><View className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>{checked ? <Check size={14} color="white" /> : null}</View><Text className="flex-1 text-sm font-medium text-slate-800">{label}</Text></TouchableOpacity>)}
                            <Text className="mt-1 text-xs leading-5 text-slate-500">One document downloads as a named PDF. Multiple documents download together in a ZIP.</Text>
                        </View>

                        <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                            <Text className="font-bold text-slate-900">Date range</Text>
                            <View className="mt-3 flex-row gap-2">
                                {([{ label: 'All time', value: false }, { label: 'Choose dates', value: true }] as const).map((choice) => <TouchableOpacity key={choice.label} onPress={() => setExportCustomDates(choice.value)} className={`rounded-full border px-4 py-2.5 ${exportCustomDates === choice.value ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${exportCustomDates === choice.value ? 'text-indigo-700' : 'text-slate-600'}`}>{choice.label}</Text></TouchableOpacity>)}
                            </View>
                            {exportCustomDates ? <><View className="mt-3 flex-row gap-2"><TouchableOpacity onPress={() => setExportDatePicker('start')} className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><Text className="text-[11px] text-slate-500">From</Text><Text className="mt-1 font-semibold text-slate-800">{formatExportDate(exportStartDate)}</Text></TouchableOpacity><TouchableOpacity onPress={() => setExportDatePicker('end')} className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"><Text className="text-[11px] text-slate-500">To</Text><Text className="mt-1 font-semibold text-slate-800">{formatExportDate(exportEndDate)}</Text></TouchableOpacity></View><TouchableOpacity onPress={setExportDatesToToday} className="mt-2 self-start flex-row items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-2"><CalendarDays size={14} color="#4f46e5" /><Text className="ml-1.5 text-xs font-semibold text-indigo-700">Today</Text></TouchableOpacity></> : null}
                        </View>

                        {exportIncludeSaved ? <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                            <Text className="font-bold text-slate-900">Saved records filters</Text>
                            <Text className="mb-2 mt-3 text-xs font-medium text-slate-500">Person</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {[{ label: 'Everyone', value: 'ALL' }, { label: 'Self', value: 'SELF' }, { label: 'Others', value: 'OTHER' }, ...relationFilterOptions.map((relation) => ({ label: relation, value: `RELATION:${relation}` }))].map((choice) => <TouchableOpacity key={choice.value} onPress={() => setExportPerson(choice.value)} className={`rounded-full border px-3 py-2 ${exportPerson === choice.value ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${exportPerson === choice.value ? 'text-indigo-700' : 'text-slate-600'}`}>{choice.label}</Text></TouchableOpacity>)}
                            </View>
                            <Text className="mb-2 mt-4 text-xs font-medium text-slate-500">Record type</Text>
                            <View className="flex-row flex-wrap gap-2">{categories.map((choice) => <TouchableOpacity key={choice.key} onPress={() => setExportCategory(choice.key)} className={`rounded-full border px-3 py-2 ${exportCategory === choice.key ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}><Text className={`text-xs font-semibold ${exportCategory === choice.key ? 'text-indigo-700' : 'text-slate-600'}`}>{choice.label}</Text></TouchableOpacity>)}</View>
                        </View> : null}

                        <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-4">
                            <Text className="font-bold text-slate-900">Doctor</Text>
                            <Text className="mt-1 text-xs text-slate-500">Select several doctors, or keep all selected.</Text>
                            <TouchableOpacity onPress={() => setExportAllDoctors((value) => !value)} className="mt-3 flex-row items-center rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"><View className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${exportAllDoctors ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>{exportAllDoctors ? <Check size={14} color="white" /> : null}</View><Text className="text-sm font-medium text-slate-800">All doctors</Text></TouchableOpacity>
                            {!exportAllDoctors ? <View className="mt-2">{doctorFilterOptions.map((doctor) => { const checked = exportDoctorIds.includes(doctor.id); return <TouchableOpacity key={doctor.id} onPress={() => toggleExportDoctor(doctor.id)} className="flex-row items-center border-b border-slate-100 px-3 py-3"><View className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>{checked ? <Check size={14} color="white" /> : null}</View><Text className="flex-1 text-sm text-slate-700">Dr. {doctor.name}</Text></TouchableOpacity>; })}{!doctorFilterOptions.length ? <Text className="px-3 py-3 text-xs text-slate-500">No doctors are linked to records yet.</Text> : null}</View> : null}
                            {exportIncludeSaved ? <TouchableOpacity onPress={() => setExportIncludePersonal((value) => !value)} className="mt-2 flex-row items-center rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"><View className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${exportIncludePersonal ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>{exportIncludePersonal ? <Check size={14} color="white" /> : null}</View><Text className="flex-1 text-sm text-slate-700">Personal records (no doctor)</Text></TouchableOpacity> : null}
                        </View>
                    </ScrollView>
                    <View className="border-t border-slate-100 bg-white px-5 py-3">
                        <TouchableOpacity disabled={exportBusy} onPress={() => void downloadRecords()} className={`flex-row items-center justify-center rounded-2xl py-4 ${exportBusy ? 'bg-indigo-300' : 'bg-indigo-600'}`}>{exportBusy ? <><ActivityIndicator size="small" color="white" /><Text className="ml-2 font-bold text-white">Preparing complete download…</Text></> : <><Download size={18} color="white" /><Text className="ml-2 font-bold text-white">Download</Text></>}</TouchableOpacity>
                    </View>
                    {exportDatePicker ? <DateTimePicker value={exportDatePicker === 'start' ? exportStartDate : exportEndDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} maximumDate={new Date()} onChange={onExportDateChange} /> : null}
                </SafeAreaView>
            </Modal>
            <Modal visible={Boolean(selectedEmrPrescription)} animationType="slide" onRequestClose={closeEmrPrescription}>
                <ModalSafeAreaProvider>
                <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
                    <View className="flex-row items-center border-b border-slate-100 px-4 py-3">
                        <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-indigo-50"><FileText size={20} color="#4f46e5" /></View>
                        <View className="flex-1">
                            <Text className="font-bold text-slate-900" numberOfLines={1}>{selectedEmrPrescription?.prescription_no || 'Doctor prescription'}</Text>
                            <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>Dr. {selectedEmrPrescription?.doctor_name || 'Doctor'}{selectedEmrPrescription?.clinic_name ? ` · ${selectedEmrPrescription.clinic_name}` : ''}</Text>
                        </View>
                        <View className="mr-3 min-w-14 items-end">{emrViewerPageCount > 0 ? <Text className="text-xs font-semibold text-slate-500">{emrViewerCurrentPage} / {emrViewerPageCount}</Text> : null}</View>
                        <TouchableOpacity accessibilityLabel="Close prescription" onPress={closeEmrPrescription} className="rounded-full bg-slate-100 p-2"><X size={20} color="#475569" /></TouchableOpacity>
                    </View>
                    <View className="flex-1 bg-slate-100">
                        {Pdf && emrViewerUrl && !emrViewerError ? <Pdf
                            key={emrViewerUrl}
                            source={{ uri: emrViewerUrl, cache: false }}
                            trustAllCerts={false}
                            style={{ flex: 1, width: '100%', backgroundColor: '#f1f5f9' }}
                            onLoadComplete={(pageCount: number) => { setEmrViewerPageCount(pageCount); setEmrViewerCurrentPage(1); setEmrViewerLoading(false); }}
                            onPageChanged={(page: number, pageCount: number) => { setEmrViewerCurrentPage(page); setEmrViewerPageCount(pageCount); }}
                            onError={() => { setEmrViewerError('Could not display this prescription. Check your connection and try again.'); setEmrViewerLoading(false); }}
                        /> : null}
                        {emrViewerLoading ? <View className="absolute inset-0 items-center justify-center bg-slate-100"><ActivityIndicator size="large" color="#4f46e5" /><Text className="mt-3 text-sm font-medium text-slate-600">Loading prescription…</Text></View> : null}
                        {emrViewerError ? <View className="flex-1 items-center justify-center px-8"><View className="h-14 w-14 items-center justify-center rounded-2xl bg-white"><FileText size={26} color="#64748b" /></View><Text className="mt-4 text-center text-sm text-slate-600">{emrViewerError}</Text>{Pdf ? <TouchableOpacity disabled={!selectedEmrPrescription} onPress={() => selectedEmrPrescription && void loadEmrPrescriptionPdf(selectedEmrPrescription)} className="mt-4 rounded-xl bg-indigo-600 px-5 py-3"><Text className="font-semibold text-white">Try again</Text></TouchableOpacity> : null}</View> : null}
                    </View>
                </SafeAreaView>
                </ModalSafeAreaProvider>
            </Modal>
            <Modal visible={Boolean(selectedRecord)} transparent animationType="fade" onRequestClose={() => setSelectedRecord(null)}>
                <ModalSafeAreaProvider>
                <SafeAreaView className="flex-1 bg-black/95" edges={['top', 'bottom']}>
                    <View className="flex-row items-start justify-between px-4 pb-2 pt-3">
                        <View className="mr-4 flex-1"><Text className="text-lg font-bold text-white" numberOfLines={2}>{selectedRecord?.title || categories.find((item) => item.key === selectedRecord?.category)?.label || 'Health record'}</Text><Text className="mt-1 text-xs text-white/70">{selectedRecord?.for_label === 'Self' ? 'Self' : selectedRecord?.relationship_label || 'Other'}  |  Page {selectedPage + 1} of {selectedRecord?.pages.length || 0}</Text></View>
                        <TouchableOpacity accessibilityLabel="Close image" onPress={() => setSelectedRecord(null)} className="rounded-full bg-white/15 p-2"><X size={22} color="white" /></TouchableOpacity>
                    </View>
                    {currentPage?.image_path ? <GestureDetector gesture={imagePinchGesture}><View className="flex-1 w-full items-center justify-center overflow-hidden" collapsable={false}><Animated.View className="h-full w-full" style={animatedImageStyle}><Image source={imageSourceFor(selectedRecord?.record_id || '', currentPage)} onError={() => handleRecordImageError(selectedRecord?.record_id || '', currentPage)} className="h-full w-full" resizeMode="contain" /></Animated.View></View></GestureDetector> : <View className="flex-1 items-center justify-center"><Text className="text-white">Image unavailable</Text></View>}
                    <View className="flex-row items-center justify-between px-4 pb-3 pt-3">
                        <TouchableOpacity accessibilityLabel="Previous page" disabled={selectedPage === 0} onPress={() => changeSelectedPage(-1)} className="rounded-full bg-white/15 p-2.5"><ChevronLeft size={20} color={selectedPage === 0 ? '#64748b' : 'white'} /></TouchableOpacity>
                        <View className="flex-row items-center gap-2">
                            {currentPage && currentPageCoordinates ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="View location" hitSlop={12} onPress={() => void openLocation(currentPage)} className="rounded-full bg-white/15 p-2.5"><MapPin size={18} color="white" /></TouchableOpacity> : null}
                        {selectedRecord?.note?.trim() ? <TouchableOpacity accessibilityLabel="View notes" onPress={() => Alert.alert('Notes', selectedRecord?.note?.trim() || '')} className="rounded-full bg-white/15 p-2.5"><FileText size={18} color="white" /></TouchableOpacity> : null}
                            <TouchableOpacity accessibilityLabel="Zoom in" disabled={imageZoom >= 3} onPress={() => setImageZoomLevel(imageZoom + 0.25)} className="rounded-full bg-white/15 p-2.5"><ZoomIn size={19} color={imageZoom >= 3 ? '#64748b' : 'white'} /></TouchableOpacity>
                            <TouchableOpacity accessibilityLabel="Zoom out" disabled={imageZoom <= 1} onPress={() => setImageZoomLevel(imageZoom - 0.25)} className="rounded-full bg-white/15 p-2.5"><ZoomOut size={19} color={imageZoom <= 1 ? '#64748b' : 'white'} /></TouchableOpacity>
                        </View>
                        <TouchableOpacity accessibilityLabel="Next page" disabled={!selectedRecord || selectedPage >= selectedRecord.pages.length - 1} onPress={() => changeSelectedPage(1)} className="rounded-full bg-white/15 p-2.5"><ChevronRight size={20} color={!selectedRecord || selectedPage >= selectedRecord.pages.length - 1 ? '#64748b' : 'white'} /></TouchableOpacity>
                    </View>
                </SafeAreaView>
                </ModalSafeAreaProvider>
            </Modal>
            <Modal visible={Boolean(locationPage)} transparent animationType="fade" onRequestClose={closeLocation}><View className="flex-1 bg-black/50 justify-center px-6"><View className="bg-white rounded-2xl p-5"><View className="flex-row items-center justify-between"><Text className="text-slate-900 font-bold text-lg">Upload location</Text><TouchableOpacity hitSlop={10} onPress={closeLocation}><X size={21} color="#475569" /></TouchableOpacity></View><Text className="text-slate-800 mt-3 font-medium">{locationAddressLoading ? 'Loading address...' : locationAddress || 'Address unavailable'}</Text>{!locationAddressLoading && !locationAddress && locationPageCoordinates ? <Text className="text-slate-500 text-xs mt-1">Coordinates: {locationPageCoordinates.latitude.toFixed(5)}, {locationPageCoordinates.longitude.toFixed(5)}</Text> : null}{locationPage?.location_accuracy_m != null && Number.isFinite(Number(locationPage.location_accuracy_m)) ? <Text className="text-slate-400 text-xs mt-2">Accuracy about {Math.round(Number(locationPage.location_accuracy_m))} m</Text> : null}{locationPageCoordinates ? <TouchableOpacity accessibilityRole="button" onPress={() => void openCoordinatesInMap()} className="bg-indigo-600 rounded-xl items-center py-3 mt-5"><Text className="text-white font-semibold">Open map</Text></TouchableOpacity> : null}</View></View></Modal>
        </SafeAreaView>
    );
}
