import React, { useMemo, useState } from 'react';
import { Modal, Text, TouchableOpacity, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

type UploadFile = {
    uri: string;
    name?: string;
};

interface PrescriptionUploadPreviewGridProps {
    files: UploadFile[];
    onRemove: (index: number) => void;
    removeDisabled?: boolean;
    emptyText?: string;
}

export default function PrescriptionUploadPreviewGrid({
    files,
    onRemove,
    removeDisabled = false,
    emptyText = 'No prescription pages selected yet.',
}: PrescriptionUploadPreviewGridProps) {
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);

    const previewFile = useMemo(
        () => (previewIndex === null ? null : files[previewIndex] ?? null),
        [files, previewIndex]
    );

    if (files.length === 0) {
        return (
            <View className="px-4 py-4">
                <Text className="text-sm text-gray-500">{emptyText}</Text>
            </View>
        );
    }

    return (
        <>
            <View className="flex-row flex-wrap px-3 py-3" style={{ gap: 12 }}>
                {files.map((file, index) => (
                    <View key={`${file.uri}-${index}`} className="relative">
                        <TouchableOpacity
                            onPress={() => setPreviewIndex(index)}
                            activeOpacity={0.9}
                            className="w-24 h-32 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100"
                        >
                            <Image
                                source={{ uri: file.uri }}
                                resizeMode="cover"
                                className="w-full h-full"
                            />
                            <View className="absolute inset-x-0 bottom-0 bg-black/45 px-2 py-1.5">
                                <Text className="text-[11px] font-semibold text-white" numberOfLines={1}>
                                    Page {index + 1}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => onRemove(index)}
                            disabled={removeDisabled}
                            className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5"
                        >
                            <X size={12} color="#ffffff" />
                        </TouchableOpacity>
                    </View>
                ))}
            </View>

            <Modal visible={previewIndex !== null} transparent={false} animationType="fade" onRequestClose={() => setPreviewIndex(null)}>
                <View className="flex-1 bg-black">
                    <SafeAreaView className="flex-1">
                        <View className="flex-row items-center justify-between px-5 py-4">
                            <View className="flex-1 pr-4">
                                <Text className="text-white text-lg font-bold">Selected Page Preview</Text>
                                <Text className="text-white/70 text-sm mt-1">
                                    {previewIndex !== null ? `Page ${previewIndex + 1} of ${files.length}` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setPreviewIndex(null)} className="rounded-full bg-white/10 p-2">
                                <X size={18} color="#ffffff" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-1 items-center justify-center px-4 pb-6">
                            {previewFile ? (
                                <Image
                                    source={{ uri: previewFile.uri }}
                                    resizeMode="contain"
                                    className="w-full h-full"
                                />
                            ) : null}
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>
        </>
    );
}
