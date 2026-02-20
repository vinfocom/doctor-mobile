import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Send, User } from 'lucide-react-native';
import { getChatMessages, sendChatMessage } from '../api/chat';

export default function ChatScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { patientId, doctorId, patientName } = route.params;

    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        fetchMessages();
        // Polling every 5s for new messages
        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchMessages = async () => {
        try {
            const data = await getChatMessages(patientId, doctorId);
            setMessages(data.messages || []);
        } catch (e) {
            console.error('Failed to fetch messages:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        setSending(true);
        try {
            await sendChatMessage({
                patient_id: patientId,
                doctor_id: doctorId,
                sender: 'DOCTOR',
                content: newMessage.trim(),
            });
            setNewMessage('');
            fetchMessages();
        } catch (e) {
            console.error('Failed to send message:', e);
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isDoctor = item.sender === 'DOCTOR';
        return (
            <View className={`mb-3 max-w-[80%] rounded-2xl px-4 py-3 ${isDoctor ? 'bg-blue-600 self-end rounded-tr-sm' : 'bg-white border border-gray-100 self-start rounded-tl-sm shadow-sm'}`}>
                <Text className={`text-base ${isDoctor ? 'text-white' : 'text-gray-800'}`}>
                    {item.content}
                </Text>
                <Text className={`text-[10px] mt-1 text-right ${isDoctor ? 'text-blue-200' : 'text-gray-400'}`}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
            {/* Header */}
            <View className="flex-row items-center px-4 py-4 border-b border-gray-100 bg-white">
                <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-2 bg-gray-50 rounded-full">
                    <ChevronLeft size={24} color="#1f2937" />
                </TouchableOpacity>
                <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center mr-3">
                    <User size={20} color="#2563eb" />
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('PatientDetails', { patientId })}>
                    <View className="flex-1">
                        <Text className="text-gray-900 font-bold text-lg">{patientName}</Text>
                        <Text className="text-gray-500 text-sm">Patient Chat</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Chat Area */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                        keyExtractor={item => item.message_id.toString()}
                        renderItem={renderMessage}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}
                    />
                )}

                {/* Input Area */}
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
                        className={`w-12 h-12 rounded-full items-center justify-center ${!newMessage.trim() || sending ? 'bg-blue-300' : 'bg-blue-600 shadow-md elevation-2'
                            }`}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Send size={20} color="#ffffff" style={{ marginLeft: 2 }} />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
