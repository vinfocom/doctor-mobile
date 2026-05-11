import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Text, TouchableOpacity, View, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, Directions, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react-native';

type PrescriptionPageItem = {
    prescription_page_id: number;
    page_number: number;
    file_url: string;
    original_file_name: string | null;
};

type PrescriptionRecordItem = {
    prescription_id: number;
    note: string | null;
    created_at: string;
    pages: PrescriptionPageItem[];
};

interface PrescriptionImageViewerModalProps {
    visible: boolean;
    prescription: PrescriptionRecordItem | null;
    onClose: () => void;
}

const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.25;
const MAX_SCALE = 4;

const clamp = (value: number, min: number, max: number) => {
    'worklet';
    return Math.min(Math.max(value, min), max);
};

export default function PrescriptionImageViewerModal({
    visible,
    prescription,
    onClose,
}: PrescriptionImageViewerModalProps) {
    const [pageIndex, setPageIndex] = useState(0);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const selectedPage = useMemo(
        () => prescription?.pages?.[pageIndex] ?? null,
        [pageIndex, prescription]
    );

    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    const resetTransform = useCallback(() => {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
    }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

    const goToPreviousPage = useCallback(() => {
        setPageIndex((prev) => Math.max(0, prev - 1));
        resetTransform();
    }, [resetTransform]);

    const goToNextPage = useCallback(() => {
        setPageIndex((prev) => {
            if (!prescription) return prev;
            return Math.min(prescription.pages.length - 1, prev + 1);
        });
        resetTransform();
    }, [prescription, resetTransform]);

    const setZoomLevel = useCallback((nextScale: number) => {
        const safeScale = Math.min(Math.max(nextScale, MIN_SCALE), MAX_SCALE);
        scale.value = withTiming(safeScale);
        savedScale.value = safeScale;
        if (safeScale <= MIN_SCALE) {
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        }
    }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

    const handleZoomIn = useCallback(() => {
        setZoomLevel(savedScale.value + 0.4);
    }, [savedScale, setZoomLevel]);

    const handleZoomOut = useCallback(() => {
        setZoomLevel(savedScale.value - 0.4);
    }, [savedScale, setZoomLevel]);

    useEffect(() => {
        if (!visible || !prescription) {
            setPageIndex(0);
            resetTransform();
            return;
        }

        setPageIndex(0);
        resetTransform();
    }, [prescription?.prescription_id, resetTransform, visible]);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((event) => {
            scale.value = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            if (scale.value <= MIN_SCALE) {
                scale.value = withTiming(MIN_SCALE);
                savedScale.value = MIN_SCALE;
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            }
        });

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (scale.value <= 1.01) return;
            translateX.value = savedTranslateX.value + event.translationX;
            translateY.value = savedTranslateY.value + event.translationY;
        })
        .onEnd(() => {
            if (scale.value <= 1.01) {
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
                return;
            }

            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(250)
        .onEnd(() => {
            const nextScale = scale.value > 1.15 ? 1 : DOUBLE_TAP_SCALE;
            scale.value = withTiming(nextScale);
            savedScale.value = nextScale;
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        });

    const swipeLeftGesture = Gesture.Fling()
        .direction(Directions.LEFT)
        .onEnd(() => {
            if (!prescription || scale.value > 1.05) return;
            if (pageIndex >= prescription.pages.length - 1) return;
            runOnJS(goToNextPage)();
        });

    const swipeRightGesture = Gesture.Fling()
        .direction(Directions.RIGHT)
        .onEnd(() => {
            if (scale.value > 1.05) return;
            if (pageIndex <= 0) return;
            runOnJS(goToPreviousPage)();
        });

    const composedGesture = Gesture.Simultaneous(
        pinchGesture,
        panGesture,
        doubleTapGesture,
        swipeLeftGesture,
        swipeRightGesture
    );

    const animatedImageStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
                <View className="flex-1 bg-black">
                    <SafeAreaView className="flex-1">
                    <View className="flex-row items-center justify-between px-5 pt-2 pb-4">
                        <View className="flex-1 pr-4">
                            <Text className="text-white text-lg font-bold">Prescription Viewer</Text>
                            <Text className="text-white/70 text-sm mt-1">
                                {prescription
                                    ? `Uploaded on ${new Date(prescription.created_at).toLocaleDateString('en-IN')}`
                                    : ''}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="bg-white/10 p-2 rounded-full">
                            <X size={18} color="#ffffff" />
                        </TouchableOpacity>
                    </View>

                    <View className="px-5 pb-3 flex-row items-center justify-end">
                        <Text className="text-white/80 text-sm">
                            {prescription ? `Page ${pageIndex + 1} of ${prescription.pages.length}` : ''}
                        </Text>
                    </View>

                    <View className="px-5 pb-3 flex-row items-center justify-end" style={{ gap: 10 }}>
                        <TouchableOpacity onPress={handleZoomOut} className="rounded-full bg-white/10 p-3">
                            <ZoomOut size={18} color="#ffffff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleZoomIn} className="rounded-full bg-white/10 p-3">
                            <ZoomIn size={18} color="#ffffff" />
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-4">
                        <GestureDetector gesture={composedGesture}>
                            <View className="flex-1 items-center justify-center overflow-hidden" collapsable={false}>
                                {selectedPage ? (
                                    <Animated.View style={animatedImageStyle}>
                                        <Image
                                            source={{ uri: selectedPage.file_url }}
                                            resizeMode="contain"
                                            style={{
                                                width: Math.min(screenWidth - 32, 420),
                                                height: Math.min(screenHeight * 0.5, 560),
                                            }}
                                        />
                                    </Animated.View>
                                ) : (
                                    <Text className="text-white/70">No page available.</Text>
                                )}
                            </View>
                        </GestureDetector>
                    </View>

                    <View className="px-5 pt-4 pb-6">
                        {prescription?.note ? (
                            <View className="rounded-2xl bg-white/10 px-4 py-3 mb-4">
                                <Text className="text-white/70 text-xs uppercase tracking-wide font-bold">Note</Text>
                                <Text className="text-white text-sm mt-1">{prescription.note}</Text>
                            </View>
                        ) : null}

                        <View className="flex-row items-center justify-center mb-4" style={{ gap: 6 }}>
                            {prescription?.pages.map((page, index) => (
                                <View
                                    key={page.prescription_page_id}
                                    className={`h-2.5 rounded-full ${index === pageIndex ? 'bg-blue-500 w-7' : 'bg-white/25 w-2.5'}`}
                                />
                            ))}
                        </View>

                        <View className="flex-row" style={{ gap: 10 }}>
                            <TouchableOpacity
                                onPress={goToPreviousPage}
                                className="flex-1 rounded-xl bg-white/10 px-4 py-3 items-center"
                                disabled={!prescription || pageIndex === 0}
                            >
                                <ChevronLeft
                                    size={18}
                                    color={!prescription || pageIndex === 0 ? 'rgba(255,255,255,0.4)' : '#ffffff'}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={goToNextPage}
                                className="flex-1 rounded-xl bg-blue-600 px-4 py-3 items-center"
                                disabled={!prescription || pageIndex >= ((prescription?.pages.length || 1) - 1)}
                            >
                                <ChevronRight
                                    size={18}
                                    color={!prescription || pageIndex >= ((prescription?.pages.length || 1) - 1) ? 'rgba(255,255,255,0.5)' : '#ffffff'}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                    </SafeAreaView>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}
