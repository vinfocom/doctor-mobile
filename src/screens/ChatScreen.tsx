import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Send, User } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getChatMessages, sendChatMessage } from '../api/chat';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
    const { patientId, doctorId, patientName, viewer = 'DOCTOR' } = route.params;
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const socketRef = useRef<Socket | null>(null);

    const mergeMessages = (prev: any[], incoming: any[]) => {
        const byId = new Map<string, any>();
        [...prev, ...incoming].forEach((msg) => {
            const key = msg.message_id
                ? `id:${msg.message_id}`
                : `tmp:${msg.temp_id || `${msg.sender}:${msg.created_at}:${msg.content}`}`;
            byId.set(key, msg);
        });
        return Array.from(byId.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    };

    const fetchMessages = async () => {
        try {
            const data = await getChatMessages(patientId, doctorId);
            setMessages((prev) => mergeMessages(prev, data.messages || []));
        } catch (e) {
            console.error('Failed to fetch messages:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages();
        const interval = setInterval(fetchMessages, 3000);
        return () => clearInterval(interval);
    }, [patientId, doctorId]);

    useEffect(() => {
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
        });
        socketRef.current = socket;

        const join = () => socket.emit('join_chat', { patientId, doctorId });
        socket.on('connect', join);
        socket.on('receive_message', (data: any) => {
            if (data?.patient_id !== patientId || data?.doctor_id !== doctorId) return;
            if (data?.content && typeof data.content === 'string' && data.content.startsWith('Announcement:')) return;
            setMessages((prev) => mergeMessages(prev, [data]));
        });
        if (socket.connected) join();

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [doctorId, patientId]);

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        const trimmed = newMessage.trim();
        const optimistic = {
            temp_id: `tmp-${Date.now()}`,
            patient_id: patientId,
            doctor_id: doctorId,
            sender: viewer === 'PATIENT' ? 'PATIENT' : 'DOCTOR',
            content: trimmed,
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => mergeMessages(prev, [optimistic]));
        setNewMessage('');
        setSending(true);
        try {
            const response = await sendChatMessage({
                patient_id: patientId,
                doctor_id: doctorId,
                sender: viewer === 'PATIENT' ? 'PATIENT' : 'DOCTOR',
                content: trimmed,
            });
            const saved = response?.message || optimistic;
            setMessages((prev) => {
                const withoutOptimistic = prev.filter((m) => m.temp_id !== optimistic.temp_id);
                return mergeMessages(withoutOptimistic, [saved]);
            });
        } catch (e) {
            console.error('Failed to send message:', e);
            setMessages((prev) => prev.filter((m) => m.temp_id !== optimistic.temp_id));
            setNewMessage(trimmed);
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        const mine = viewer === 'PATIENT' ? item.sender === 'PATIENT' : item.sender === 'DOCTOR';
        const formattedTime = new Date(item.created_at).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata',
        });
        return (
            <View className={`mb-3 max-w-[80%] rounded-2xl px-4 py-3 ${mine ? 'bg-blue-600 self-end rounded-tr-sm' : 'bg-white border border-gray-100 self-start rounded-tl-sm shadow-sm'}`}>
                <Text className={`text-base ${mine ? 'text-white' : 'text-gray-800'}`}>{item.content}</Text>
                <Text className={`text-[10px] mt-1 text-right ${mine ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formattedTime}
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
            <View className="flex-row items-center px-4 py-4 border-b border-gray-100 bg-white">
                <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-2 bg-gray-50 rounded-full">
                    <ChevronLeft size={24} color="#1f2937" />
                </TouchableOpacity>
                <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center mr-3">
                    <User size={20} color="#2563eb" />
                </View>
                <View className="flex-1">
                    <Text className="text-gray-900 font-bold text-lg">{patientName}</Text>
                    <Text className="text-gray-500 text-sm">{viewer === 'PATIENT' ? 'Doctor Chat' : 'Patient Chat'}</Text>
                </View>
                {viewer === 'DOCTOR' ? (
                    <TouchableOpacity onPress={() => navigation.navigate('PatientDetails', { patientId })}>
                        <Text className="text-blue-600 text-xs font-semibold">Details</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 72}
                className="flex-1 bg-gray-50"
            >
                {loading ? (
                    <View className="flex-1 justify-center items-center">
                        <ActivityIndicator size="large" color="#2563eb" />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item, index) =>
                            item.message_id
                                ? `id:${item.message_id}`
                                : `tmp:${item.temp_id || `${item.sender}:${item.created_at}:${index}`}`
                        }
                        renderItem={renderMessage}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                <View className="px-4 py-3 bg-white border-t border-gray-100 flex-row items-center">
                    <TextInput
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-5 py-3 text-base text-gray-800 mr-3"
                        placeholder="Type a message..."
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                        maxLength={500}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!newMessage.trim() || sending}
                        className={`w-12 h-12 rounded-full items-center justify-center ${!newMessage.trim() || sending ? 'bg-blue-300' : 'bg-blue-600'}`}
                    >
                        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={20} color="#ffffff" style={{ marginLeft: 2 }} />}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
