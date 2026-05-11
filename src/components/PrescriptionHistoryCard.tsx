import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { FileText, Trash2 } from 'lucide-react-native';

type PrescriptionPageItem = {
    prescription_page_id: number;
    page_number: number;
    file_url: string;
};

type PrescriptionRecordItem = {
    prescription_id: number;
    created_at: string;
    page_count: number;
    note: string | null;
    pages: PrescriptionPageItem[];
};

interface PrescriptionHistoryCardProps {
    record: PrescriptionRecordItem;
    uploaderLabel: string;
    onView: () => void;
    onDelete: () => void;
}

export default function PrescriptionHistoryCard({
    record,
    uploaderLabel,
    onView,
    onDelete,
}: PrescriptionHistoryCardProps) {
    const thumbnailUrl = record.pages?.[0]?.file_url || '';

    return (
        <TouchableOpacity
            onPress={onView}
            activeOpacity={0.9}
            className="rounded-2xl border border-gray-200 bg-white p-3"
        >
            <View className="flex-row">
                <View className="h-24 w-20 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                    {thumbnailUrl ? (
                        <Image source={{ uri: thumbnailUrl }} resizeMode="cover" className="h-full w-full" />
                    ) : (
                        <View className="flex-1 items-center justify-center">
                            <FileText size={20} color="#94a3b8" />
                        </View>
                    )}
                </View>

                <View className="ml-3 flex-1 justify-between">
                    <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                            <Text className="text-sm font-bold text-gray-900">
                                Uploaded on {new Date(record.created_at).toLocaleDateString('en-IN')}
                            </Text>
                            <Text className="mt-1 text-xs text-gray-500">
                                {uploaderLabel}
                            </Text>
                        </View>
                        <View className="items-end">
                            <TouchableOpacity
                                onPress={onDelete}
                                className="rounded-full border border-red-200 bg-white p-2"
                            >
                                <Trash2 size={14} color="#dc2626" />
                            </TouchableOpacity>
                            <View className="mt-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                                <Text className="text-[11px] font-semibold text-gray-700">
                                    {record.page_count} {record.page_count === 1 ? 'page' : 'pages'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {record.note ? (
                        <Text className="mt-2 text-xs text-gray-600" numberOfLines={2} ellipsizeMode="tail">
                            {record.note}
                        </Text>
                    ) : null}

                </View>
            </View>
        </TouchableOpacity>
    );
}
