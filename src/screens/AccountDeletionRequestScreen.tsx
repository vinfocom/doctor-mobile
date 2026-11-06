import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import client from '../api/client';
import { removeToken } from '../api/token';
import { useAuthSession } from '../context/AuthSessionContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AccountDeletionRequest'>;

export default function AccountDeletionRequestScreen() {
    const navigation = useNavigation<Nav>();
    const { clearSession } = useAuthSession();
    const [password, setPassword] = useState('');
    const [reason, setReason] = useState('');
    const [showReasonOptions, setShowReasonOptions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const submitRequest = async () => {
        if (!password.trim() || !reason) {
            setError(!password.trim() ? 'Enter your password to verify this request.' : 'Choose a reason for your request.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await client.post('/account-deletion-requests', { password, reason });
            const alreadyPending = response?.data?.reused === true;
            Alert.alert(
                alreadyPending ? 'Request under review' : 'Request received',
                alreadyPending
                    ? 'Your account deletion request is under review. You have already requested deletion of your account. We will process it within some days after verification.'
                    : 'Your request has been received. We will process it within some days.',
                [{ text: 'OK', onPress: async () => {
                    await removeToken();
                    clearSession();
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                } }],
                { cancelable: false }
            );
        } catch (err: any) {
            setError(err?.response?.data?.error || 'We could not submit your request. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const confirmRequest = () => {
        Alert.alert(
            'Confirm account deletion request',
            'This sends a request to Dapto Support. Your account will not be deleted automatically.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Continue', style: 'destructive', onPress: submitRequest },
            ]
        );
    };

    if (Platform.OS !== 'ios') return null;

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
            <KeyboardAvoidingView className="flex-1" behavior="padding">
                <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="mb-6 h-10 w-10 items-center justify-center rounded-full bg-white">
                        <ChevronLeft size={23} color="#1d4ed8" />
                    </TouchableOpacity>
                    <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
                        <Trash2 size={26} color="#dc2626" />
                    </View>
                    <Text className="text-2xl font-bold text-gray-900">Request account deletion</Text>
                    <Text className="mt-3 text-base leading-6 text-gray-600">
                        This request asks Dapto Support to review deletion of your account and associated personal information.
                    </Text>
                    <Text className="mt-4 text-sm leading-5 text-gray-600">
                        Where permitted or required by law, certain healthcare records, prescriptions, appointment records, audit logs, or other information may be retained for legal, regulatory, security, dispute resolution, or legitimate business purposes.
                    </Text>
                    <Text className="mt-4 text-sm leading-5 text-gray-600">
                        Your request will be processed within some days after verification. Your account will not be deleted automatically.
                    </Text>
                    <Text className="mt-7 text-sm font-semibold text-gray-800">Verify your password</Text>
                    <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!loading}
                        className="mt-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                        accessibilityLabel="Account password"
                    />
                    <Text className="mt-5 text-sm font-semibold text-gray-800">Reason for deletion</Text>
                    <TouchableOpacity
                        onPress={() => setShowReasonOptions((visible) => !visible)}
                        disabled={loading}
                        className="mt-2 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3"
                        accessibilityRole="button"
                        accessibilityLabel="Choose a reason for account deletion"
                        accessibilityState={{ expanded: showReasonOptions }}
                    >
                        <Text className={reason ? 'text-base text-gray-900' : 'text-base text-gray-400'}>
                            {reason || 'Choose a reason'}
                        </Text>
                        <Text className="text-gray-500">{showReasonOptions ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showReasonOptions ? (
                        <View className="mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
                            {[
                                'I no longer need Dapto',
                                'I have privacy concerns',
                                'I am using another service',
                                'I have an account issue',
                                'I have trouble using the app',
                                'I receive too many notifications',
                                'I have a duplicate account',
                                'I no longer use this phone number',
                                'The service is not available in my area',
                                'I am leaving the clinic or practice',
                                'Other',
                            ].map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    onPress={() => { setReason(option); setShowReasonOptions(false); setError(''); }}
                                    className="border-b border-gray-100 px-4 py-3"
                                    accessibilityRole="button"
                                >
                                    <Text className="text-sm text-gray-800">{option}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}
                    {error ? <Text accessibilityRole="alert" className="mt-3 text-sm text-red-700">{error}</Text> : null}
                    <View className="mt-auto pt-8">
                        <TouchableOpacity
                            onPress={confirmRequest}
                            disabled={loading}
                            className="min-h-12 flex-row items-center justify-center rounded-xl px-4 py-3"
                            style={{ backgroundColor: loading ? '#fca5a5' : '#dc2626' }}
                            accessibilityRole="button"
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text className="font-bold text-white">Request account deletion</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => navigation.goBack()} disabled={loading} className="mt-3 items-center rounded-xl bg-white px-4 py-3">
                            <Text className="font-semibold text-gray-700">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
