import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eye, Info } from 'lucide-react-native';
import type { CheckResult } from './WellnessCheckScreen';

type EyeSide = 'left' | 'right';
type Direction = 'up' | 'down' | 'left' | 'right';
type Phase = 'instructions' | 'eye-select' | 'eye-ready' | 'testing' | 'between-eyes' | 'result';
type Trial = { type: 'E' | 'C'; direction: Direction; rotation: number };
type TrialResponse = { level: number; type: Trial['type']; expected: Direction; selected: Direction };
type EyeProgress = { passedLevels: number; correctResponses: number; responses: TrialResponse[] };
type BothEyeResults = Record<EyeSide, CheckResult>;

const INSTRUCTIONS = [
    { title: 'Welcome to the Eye Test', body: 'You will check each eye separately. When a symbol appears, tap Up, Down, Left, or Right to show where it opens.', image: require('../../assets/wellness/welcome_eye_test.png') },
    { title: 'Find the Right Spot', body: 'Sit upright in a well-lit room and reduce glare. Hold your phone at a comfortable distance, keep your head and phone steady, and stay in the same position.', image: require('../../assets/wellness/correct_posture_distance.png') },
    { title: 'Cover One Eye', body: 'Choose which eye to test first. Gently cover the other eye with your palm or an occluder. Do not press on it or peek through your fingers. Use glasses consistently if you normally wear them.', image: require('../../assets/wellness/cover_one_eye.png') },
    { title: 'Understand the Symbol', body: 'Tap the direction of the opening. For E, follow the direction its bars point. For C, follow the gap.', image: require('../../assets/wellness/understand_E_C_orientations.png') },
    { title: 'Symbols Get Smaller', body: 'The symbols become smaller at each level. Keep the phone in the same position and identify each symbol as accurately as you can.', image: require('../../assets/wellness/progressively_smaller_symbols.png') },
    { title: 'Take the Test Fairly', body: 'Do not zoom in, move closer, or ask someone to identify a symbol. Answer as accurately as possible. Keep conditions the same for both eyes and stop if uncomfortable.', image: require('../../assets/wellness/take_test_fairly.png') },
    { title: 'Ready to Begin?', body: 'You will test each eye independently. This informal activity is not a diagnosis or a substitute for a professional eye examination.', image: require('../../assets/wellness/ready_to_begin.png') },
] as const;

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];
// The named assets confirm both base paths face left. The named variants encode
// the rotations below; scoring uses the same direction used to select the asset.
const ROTATION_FOR_NAMED_ASSET: Record<string, number> = {
    'E_opening_left.svg': 0,
    'E_opening_up.svg': 90,
    'E_opening_right.svg': 180,
    'E_opening_down.svg': 270,
    'C_opening_left.svg': 0,
    'C_opening_up.svg': 90,
    'C_opening_right.svg': 180,
    'C_opening_down.svg': 270,
};
const rotationFor = (type: Trial['type'], direction: Direction) => ROTATION_FOR_NAMED_ASSET[`${type}_opening_${direction}.svg`];
// Relative React Native display sizes only; these levels are not calibrated visual-acuity values.
const SYMBOL_SIZES = [112, 96, 82, 70, 60, 51, 43, 36, 31, 26, 22];
const TRIALS_PER_LEVEL = 2;
const TOTAL_TRIALS = SYMBOL_SIZES.length * TRIALS_PER_LEVEL;
const RESPONSE_OPTIONS: { direction: Direction; label: string; Icon: typeof ArrowUp }[] = [
    { direction: 'up', label: 'Up', Icon: ArrowUp },
    { direction: 'left', label: 'Left', Icon: ArrowLeft },
    { direction: 'down', label: 'Down', Icon: ArrowDown },
    { direction: 'right', label: 'Right', Icon: ArrowRight },
];

function createTrials(): Trial[] {
    const trials: Trial[] = [];
    while (trials.length < TOTAL_TRIALS) {
        const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        const type = Math.random() < 0.5 ? 'E' : 'C';
        const previous = trials[trials.length - 1];
        if (previous?.type === type && previous.direction === direction) continue;
        trials.push({ type, direction, rotation: rotationFor(type, direction) });
    }
    if (!trials.some((trial) => trial.type === 'E')) trials[Math.floor(Math.random() * trials.length)].type = 'E';
    if (!trials.some((trial) => trial.type === 'C')) trials[Math.floor(Math.random() * trials.length)].type = 'C';
    // A fallback type change above must also update the rendered orientation for that type.
    for (const trial of trials) trial.rotation = rotationFor(trial.type, trial.direction);
    return trials;
}

// Base vector paths are taken from E_opening_left.svg and C_opening_left.svg.
// The transform below selects the matching named opening orientation natively.
const E_PATH = 'M 46 60 L 46 989 L 976 989 L 976 60 Z M 148 163 L 873 162 L 874 886 L 149 887 Z M 253 267 L 253 369 L 667 370 L 666 473 L 253 473 L 253 576 L 666 576 L 666 680 L 253 680 L 253 782 L 769 782 L 769 267 Z';
const C_PATH = 'M 143 17 L 136 17 L 135 18 L 124 18 L 123 19 L 117 19 L 116 20 L 112 20 L 111 21 L 104 22 L 101 24 L 99 24 L 93 27 L 91 27 L 79 33 L 77 35 L 72 37 L 65 43 L 61 45 L 45 61 L 45 62 L 37 72 L 36 75 L 32 80 L 30 84 L 30 86 L 28 88 L 28 90 L 26 93 L 26 95 L 25 96 L 25 98 L 24 99 L 24 101 L 22 104 L 22 107 L 21 108 L 21 112 L 73 112 L 76 106 L 78 104 L 79 101 L 82 98 L 82 97 L 87 92 L 87 91 L 97 82 L 98 82 L 101 79 L 104 78 L 106 76 L 112 73 L 114 73 L 118 71 L 127 70 L 128 69 L 149 69 L 150 70 L 154 70 L 155 71 L 159 71 L 160 72 L 162 72 L 165 74 L 167 74 L 171 76 L 173 78 L 180 82 L 192 93 L 192 94 L 198 101 L 201 108 L 203 110 L 204 115 L 206 118 L 206 122 L 207 123 L 207 127 L 208 128 L 208 149 L 207 150 L 207 155 L 206 156 L 206 159 L 204 162 L 204 164 L 203 165 L 202 169 L 200 171 L 198 176 L 191 184 L 191 185 L 180 195 L 179 195 L 176 198 L 171 200 L 167 203 L 165 203 L 164 204 L 162 204 L 158 206 L 155 206 L 154 207 L 150 207 L 149 208 L 128 208 L 127 207 L 123 207 L 122 206 L 115 205 L 101 198 L 93 191 L 92 191 L 87 186 L 87 185 L 79 176 L 73 165 L 21 165 L 22 173 L 24 176 L 26 184 L 30 191 L 31 195 L 33 197 L 37 205 L 45 215 L 45 216 L 60 231 L 61 231 L 72 240 L 75 241 L 82 246 L 86 247 L 96 252 L 98 252 L 99 253 L 101 253 L 105 255 L 108 255 L 112 257 L 124 258 L 125 259 L 136 259 L 137 260 L 139 260 L 140 259 L 151 259 L 152 258 L 159 258 L 160 257 L 169 256 L 170 255 L 172 255 L 173 254 L 181 252 L 184 250 L 186 250 L 191 247 L 195 246 L 197 244 L 205 240 L 212 234 L 216 232 L 232 216 L 232 215 L 240 205 L 241 202 L 246 195 L 248 191 L 248 189 L 251 184 L 253 176 L 255 173 L 256 165 L 257 164 L 257 161 L 258 160 L 258 117 L 257 116 L 257 112 L 256 111 L 255 104 L 253 101 L 251 93 L 247 86 L 246 82 L 244 80 L 240 72 L 237 69 L 237 68 L 234 65 L 234 64 L 231 61 L 231 60 L 216 45 L 212 43 L 205 37 L 200 35 L 198 33 L 186 27 L 184 27 L 181 25 L 179 25 L 178 24 L 176 24 L 173 22 L 170 22 L 169 21 L 165 21 L 164 20 L 161 20 L 160 19 L 155 19 L 154 18 L 144 18 Z';

function EyeOptotype({ trial, size }: { trial: Trial; size: number }) {
    const viewBox = trial.type === 'E' ? '0 0 1041 1041' : '0 0 292 292';
    const center = trial.type === 'E' ? '520.5 520.5' : '146 146';
    return (
        <Svg width={size} height={size} viewBox={viewBox} accessibilityLabel={`${trial.type} symbol`}>
            <G transform={trial.rotation ? `rotate(${trial.rotation} ${center})` : undefined}>
                {trial.type === 'E' ? <Path d={E_PATH} fill="#000000" fillRule="evenodd" transform="translate(9 0)" /> : <Path d={C_PATH} fill="#000000" fillRule="evenodd" transform={Platform.OS === 'ios' ? 'translate(146 146) scale(1.05) translate(-139.5 -138.5)' : 'translate(146 146) scale(1.1) translate(-146 -146) translate(16 0)'} />}
            </G>
        </Svg>
    );
}

function passedLevels(responses: TrialResponse[]) {
    let passed = 0;
    for (let level = 0; level < SYMBOL_SIZES.length; level += 1) {
        const levelResponses = responses.filter((response) => response.level === level);
        if (levelResponses.length === TRIALS_PER_LEVEL && levelResponses.every((response) => response.expected === response.selected)) passed += 1;
    }
    return passed;
}

function countCorrectResponses(responses: TrialResponse[]) {
    return responses.reduce((count, response) => count + (response.expected === response.selected ? 1 : 0), 0);
}


export default function WellnessEyeTestScreen({ onBack, onComplete }: { onBack: () => void; onComplete: (result: CheckResult) => Promise<void> }) {
    const [phase, setPhase] = useState<Phase>('instructions');
    const [instructionIndex, setInstructionIndex] = useState(0);
    const [saveConsent, setSaveConsent] = useState(false);
    const [firstEye, setFirstEye] = useState<EyeSide | null>(null);
    const [currentEye, setCurrentEye] = useState<EyeSide | null>(null);
    const [eyeProgress, setEyeProgress] = useState<Partial<Record<EyeSide, EyeProgress>>>({});
    const [trials, setTrials] = useState<Trial[]>([]);
    const [trialIndex, setTrialIndex] = useState(0);
    const [responses, setResponses] = useState<TrialResponse[]>([]);
    const [finalResult, setFinalResult] = useState<BothEyeResults | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saved, setSaved] = useState(false);
    const [reviewEye, setReviewEye] = useState<EyeSide | null>(null);
    const locked = useRef(false);
    const savingRef = useRef(false);
    const savedEyes = useRef<Record<EyeSide, boolean>>({ left: false, right: false });
    const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentTrial = trials[trialIndex];
    const instruction = INSTRUCTIONS[instructionIndex];

    const persist = useCallback(async (results: BothEyeResults) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setSaveError('');
        try {
            for (const eye of ['left', 'right'] as EyeSide[]) {
                if (savedEyes.current[eye]) continue;
                await onComplete(results[eye]);
                savedEyes.current[eye] = true;
            }
            setSaved(true);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Could not save this result.');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [onComplete]);

    const beginEye = useCallback(() => {
        locked.current = false;
        setTrials(createTrials());
        setTrialIndex(0);
        setResponses([]);
        setPhase('testing');
    }, []);

    const finishEye = useCallback((eye: EyeSide, nextResponses: TrialResponse[]) => {
        const progress = { passedLevels: passedLevels(nextResponses), correctResponses: countCorrectResponses(nextResponses), responses: nextResponses };
        const updated = { ...eyeProgress, [eye]: progress };
        setEyeProgress(updated);
        locked.current = false;
        if (eye === firstEye) {
            setPhase('between-eyes');
            return;
        }

        const makeResult = (side: EyeSide, progressForEye: EyeProgress): CheckResult => ({
            result_value: progressForEye.correctResponses,
            result_unit: `of ${TOTAL_TRIALS} correct responses`,
            result_summary: `${side === 'left' ? 'Left' : 'Right'} eye: ${progressForEye.correctResponses} of ${TOTAL_TRIALS} symbol directions correct; completed ${progressForEye.passedLevels} of ${SYMBOL_SIZES.length} relative on-screen size levels (two correct responses at each level). This is an informal activity result, not a visual-acuity measurement or diagnosis.`,
            method_version: `vision-relative-size-activity-v4-${side}`,
        });
        const items: BothEyeResults = {
            left: makeResult('left', updated.left ?? { passedLevels: 0, correctResponses: 0, responses: [] }),
            right: makeResult('right', updated.right ?? { passedLevels: 0, correctResponses: 0, responses: [] }),
        };
        setFinalResult(items);
        setPhase('result');
        void persist(items);
    }, [eyeProgress, firstEye, persist]);

    const respond = useCallback((direction: Direction) => {
        if (phase !== 'testing' || locked.current || !currentTrial || !currentEye) return;
        locked.current = true;
        // The trial direction is the source used to choose the artwork rotation.
        // Score against that same value so display and scoring cannot diverge.
        const expected = currentTrial.direction;
        const nextResponses = [...responses, { level: Math.floor(trialIndex / TRIALS_PER_LEVEL), type: currentTrial.type, expected, selected: direction }];
        setResponses(nextResponses);
        transitionTimer.current = setTimeout(() => {
            if (trialIndex + 1 < TOTAL_TRIALS) {
                setTrialIndex((index) => index + 1);
                locked.current = false;
            } else {
                finishEye(currentEye, nextResponses);
            }
        }, 220);
    }, [currentEye, currentTrial, finishEye, phase, responses, trialIndex]);

    const startSelectedEye = () => {
        if (!firstEye) return;
        setCurrentEye(firstEye);
        setPhase('eye-ready');
    };

    const continueToSecondEye = () => {
        const secondEye: EyeSide = firstEye === 'left' ? 'right' : 'left';
        setCurrentEye(secondEye);
        setTrials(createTrials());
        setTrialIndex(0);
        setResponses([]);
        locked.current = false;
        setPhase('testing');
    };

    const resetFlow = () => {
        setInstructionIndex(0);
        setSaveConsent(false);
        setFirstEye(null);
        setCurrentEye(null);
        setEyeProgress({});
        setTrials([]);
        setTrialIndex(0);
        setResponses([]);
        setFinalResult(null);
        setReviewEye(null);
        savedEyes.current = { left: false, right: false };
        setSaved(false);
        setSaveError('');
        setPhase('instructions');
    };

    const handleBack = useCallback(() => {
        if (phase === 'testing') {
            Alert.alert('Pause eye test?', 'Your current eye will not be submitted unless you complete it.', [
                { text: 'Keep testing', style: 'cancel' },
                { text: 'Exit test', style: 'destructive', onPress: () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); locked.current = false; setPhase('eye-ready'); } },
            ]);
        } else if (phase === 'instructions') {
            if (instructionIndex > 0) setInstructionIndex((index) => index - 1);
            else onBack();
        } else if (phase === 'eye-select') {
            setPhase('instructions');
            setInstructionIndex(INSTRUCTIONS.length - 1);
        } else if (phase === 'eye-ready') {
            if (eyeProgress[firstEye || 'left']) {
                setCurrentEye(firstEye);
                setPhase('between-eyes');
            }
            else setPhase('eye-select');
        } else if (phase === 'between-eyes') {
            if (currentEye) setCurrentEye(currentEye === 'left' ? 'right' : 'left');
            setPhase('eye-ready');
        } else {
            onBack();
        }
    }, [currentEye, eyeProgress, firstEye, instructionIndex, onBack, phase]);

    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => { handleBack(); return true; });
        return () => subscription.remove();
    }, [handleBack]);
    useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);

    if (phase === 'testing' && currentTrial) {
        const size = SYMBOL_SIZES[Math.floor(trialIndex / TRIALS_PER_LEVEL)];
        return <View className="flex-1 bg-white" accessibilityLabel="Vision response screen">
            <View className="items-center pt-8"><Text className="font-semibold text-slate-500">{trialIndex + 1} of {TOTAL_TRIALS}</Text><Text className="mt-1 text-lg font-bold text-slate-900">Which way does it open?</Text></View>
            <View className="flex-1 items-center justify-center bg-white">
                <EyeOptotype trial={currentTrial} size={size} />
            </View>
            <View className="items-center pb-8">
                <View className="flex-row justify-center">
                    {RESPONSE_OPTIONS.slice(0, 1).map(({ direction, label, Icon }) => <TouchableOpacity key={direction} accessibilityRole="button" accessibilityLabel={`Opening is ${label}`} onPress={() => respond(direction)} className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-blue-600"><Icon size={25} color="white" /><Text className="text-xs font-semibold text-white">{label}</Text></TouchableOpacity>)}
                </View>
                <View className="mt-2 flex-row items-center justify-center gap-3">
                    {RESPONSE_OPTIONS.slice(1).map(({ direction, label, Icon }) => <TouchableOpacity key={direction} accessibilityRole="button" accessibilityLabel={`Opening is ${label}`} onPress={() => respond(direction)} className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-blue-600"><Icon size={25} color="white" /><Text className="text-xs font-semibold text-white">{label}</Text></TouchableOpacity>)}
                </View>
            </View>
        </View>;
    }

    if (phase === 'instructions') {
        return <View className="flex-1 bg-slate-50">
            <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3">
                <View className="flex-row items-center justify-between">
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={instructionIndex > 0 ? 'Go back one instruction' : 'Exit eye test'} onPress={handleBack} className="flex-row items-center py-2"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">{instructionIndex > 0 ? 'Eye Test' : 'Back to tests'}</Text></TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={() => setInstructionIndex(INSTRUCTIONS.length - 1)}><Text className="font-semibold text-white">Skip instructions</Text></TouchableOpacity>
                </View>
                <Text className="mt-2 text-2xl font-bold text-white">{instruction.title}</Text>
                <Text className="mt-1 text-blue-100">Step {instructionIndex + 1} of {INSTRUCTIONS.length}</Text>
            </View>
            <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 20 }}>
                <View className="rounded-3xl bg-white p-5 shadow-sm">
                    <View className="h-60 w-full items-center justify-center overflow-hidden rounded-2xl bg-white"><Image source={instruction.image} resizeMode="contain" style={{ width: '100%', height: '100%' }} /></View>
                    <Text className="mt-4 text-lg leading-7 text-slate-700">{instruction.body}</Text>
                    <View className="mt-5 flex-row items-center justify-center gap-2">{INSTRUCTIONS.map((_, index) => <View key={index} className="h-2 rounded-full" style={{ width: index === instructionIndex ? 25 : 8, backgroundColor: index <= instructionIndex ? '#2563eb' : '#dbeafe' }} />)}</View>
                    {instructionIndex === INSTRUCTIONS.length - 1 ? <View className="mt-4 rounded-2xl bg-orange-50 p-4"><Text className="font-semibold text-orange-900">Informal activity only</Text><Text className="mt-1 leading-5 text-orange-900">The phone display and viewing distance are not calibrated. Results are not a visual-acuity score, diagnosis, or replacement for an eye examination.</Text></View> : null}
                    {instructionIndex === INSTRUCTIONS.length - 1 ? <TouchableOpacity onPress={() => setSaveConsent((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: saveConsent }} className="mt-4 flex-row items-center"><View className={`mr-2 h-5 w-5 items-center justify-center rounded border ${saveConsent ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white'}`}>{saveConsent ? <Text className="text-xs font-bold text-white">✓</Text> : null}</View><Text className="flex-1 text-xs leading-4 text-slate-600">I agree to save this result in Wellness history. It is not a diagnosis.</Text></TouchableOpacity> : null}
                    <TouchableOpacity disabled={instructionIndex === INSTRUCTIONS.length - 1 && !saveConsent} onPress={() => { if (instructionIndex < INSTRUCTIONS.length - 1) setInstructionIndex((index) => index + 1); else setPhase('eye-select'); }} className={`mt-5 rounded-full py-4 ${instructionIndex < INSTRUCTIONS.length - 1 || saveConsent ? 'bg-blue-600' : 'bg-slate-300'}`}><Text className="text-center font-bold text-white">{instructionIndex === INSTRUCTIONS.length - 1 ? 'Start eye test' : 'Continue'}</Text></TouchableOpacity>
                </View>
            </ScrollView>
        </View>;
    }

    if (phase === 'eye-select') return <View className="flex-1 bg-slate-50">
        <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><TouchableOpacity onPress={handleBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">Eye Test instructions</Text></TouchableOpacity><Text className="text-2xl font-bold text-white">Choose an eye</Text></View>
        <View className="flex-1 justify-center px-4"><Text className="mb-5 text-center text-xl font-bold text-slate-900">Which eye would you like to test first?</Text>
            {(['left', 'right'] as EyeSide[]).map((eye) => <TouchableOpacity key={eye} onPress={() => setFirstEye(eye)} accessibilityRole="button" accessibilityState={{ selected: firstEye === eye }} className="mb-3 flex-row items-center rounded-3xl border bg-white p-5" style={{ borderColor: firstEye === eye ? '#2563eb' : '#e2e8f0', borderWidth: firstEye === eye ? 2 : 1 }}><View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-blue-50"><Eye size={25} color="#2563eb" /></View><View className="flex-1"><Text className="text-lg font-bold capitalize text-slate-900">{eye} eye</Text><Text className="mt-1 text-slate-600">You will gently cover the other eye.</Text></View></TouchableOpacity>)}
            <TouchableOpacity disabled={!firstEye} onPress={startSelectedEye} className="mt-3 rounded-full bg-blue-600 py-4" style={{ opacity: firstEye ? 1 : 0.5 }}><Text className="text-center font-bold text-white">Continue</Text></TouchableOpacity>
        </View>
    </View>;

    if (phase === 'eye-ready' && currentEye) {
        const coverEye = currentEye === 'left' ? 'right' : 'left';
        const isSecondEye = Boolean(eyeProgress[firstEye || 'left']);
        return <View className="flex-1 bg-slate-50">
            <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><TouchableOpacity onPress={handleBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">Eye Test</Text></TouchableOpacity><Text className="text-2xl font-bold text-white">{isSecondEye ? 'Now the other eye' : 'Get ready'}</Text></View>
            <View className="flex-1 justify-center px-4"><View className="rounded-3xl bg-white p-5 shadow-sm"><View className="mb-4 items-center rounded-2xl bg-blue-50 py-5"><Eye size={48} color="#2563eb" /><Text className="mt-2 text-xl font-bold capitalize text-slate-900">Testing the {currentEye} eye</Text></View>
                <Text className="text-base leading-6 text-slate-700">Gently cover your {coverEye} eye without pressing or peeking. Keep your phone and head steady. Use the same glasses and lighting conditions as for the other eye.</Text>
                <View className="mt-4 flex-row items-start rounded-2xl bg-orange-50 p-4"><Info size={19} color="#c2410c" /><Text className="ml-2 flex-1 leading-5 text-orange-900">Stop if your eye feels uncomfortable. This activity does not measure visual acuity.</Text></View>
                <TouchableOpacity onPress={beginEye} className="mt-5 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">I’m ready</Text></TouchableOpacity>
            </View></View>
        </View>;
    }

    if (phase === 'between-eyes' && currentEye) {
        const passed = eyeProgress[currentEye]?.passedLevels ?? 0;
        const nextEye = currentEye === 'left' ? 'right' : 'left';
        return <View className="flex-1 bg-slate-50"><View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><Text className="text-2xl font-bold text-white">First eye complete</Text><Text className="mt-1 text-blue-100">Now test the other eye separately</Text></View><View className="flex-1 justify-center px-4"><View className="items-center rounded-3xl bg-white p-6"><Check size={48} color="#16a34a" /><Text className="mt-4 text-xl font-bold capitalize text-slate-900">{currentEye} eye finished</Text><Text className="mt-2 text-center leading-6 text-slate-600">{eyeProgress[currentEye]?.correctResponses ?? 0} of {TOTAL_TRIALS} directions correct</Text><Text className="mt-1 text-center text-slate-500">Small-size levels completed: {passed} of {SYMBOL_SIZES.length}</Text><Text className="mt-4 text-center leading-6 text-slate-700">Cover your {nextEye} eye without pressing on it. The {nextEye} eye will start when you continue.</Text><TouchableOpacity onPress={continueToSecondEye} accessibilityRole="button" className="mt-6 w-full rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Start {nextEye} eye</Text></TouchableOpacity></View></View></View>;
    }

    return <View className="flex-1 bg-slate-50">
        <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><Text className="text-2xl font-bold text-white">Eye Test results</Text></View>
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}><View className="rounded-3xl bg-white p-5 shadow-sm">
            <View className="items-center rounded-2xl bg-emerald-50 p-5"><Check size={48} color="#16a34a" /><Text className="mt-2 text-xl font-bold text-slate-900">Both eyes completed</Text></View>
            {(['left', 'right'] as EyeSide[]).map((eye) => <View key={eye} className="mt-3 rounded-2xl bg-blue-50 p-4">
                <View className="flex-row items-center"><Eye size={24} color="#2563eb" /><View className="ml-3"><Text className="font-bold capitalize text-slate-900">{eye} eye</Text><Text className="mt-1 text-slate-700">{eyeProgress[eye]?.correctResponses ?? 0} of {TOTAL_TRIALS} directions correct</Text><Text className="mt-1 text-slate-500">Levels with both responses correct: {eyeProgress[eye]?.passedLevels ?? 0} of {SYMBOL_SIZES.length}</Text></View></View>
                <TouchableOpacity onPress={() => setReviewEye(reviewEye === eye ? null : eye)} className="mt-3 self-start rounded-full bg-white px-3 py-2"><Text className="font-semibold text-blue-700">{reviewEye === eye ? 'Hide response review' : 'Review responses'}</Text></TouchableOpacity>
                {reviewEye === eye ? <View className="mt-3 rounded-xl bg-white px-3">{(eyeProgress[eye]?.responses ?? []).map((response, index) => <View key={`${eye}-${index}`} className="flex-row items-center justify-between border-b border-slate-100 py-2"><Text className="text-sm text-slate-700">{index + 1}. {response.type} · opening {response.expected}</Text><Text className={response.expected === response.selected ? 'text-sm font-bold text-emerald-700' : 'text-sm font-bold text-rose-700'}>selected {response.selected} {response.expected === response.selected ? '✓' : '×'}</Text></View>)}</View> : null}
            </View>)}
            <View className="mt-4 rounded-2xl bg-orange-50 p-4"><Text className="font-bold text-orange-900">Not a vision measurement</Text><Text className="mt-1 leading-5 text-orange-900">These are informal on-screen activity levels. They are not calibrated for distance or screen size, do not provide a 6/6 or Snellen value, and cannot rule out an eye condition.</Text></View>
            {saving ? <Text className="mt-4 text-center text-slate-600">Saving result…</Text> : null}
            {saveError ? <View className="mt-4"><Text className="text-center text-rose-700">{saveError}</Text><TouchableOpacity onPress={() => finalResult && void persist(finalResult)} className="mt-3 rounded-full bg-blue-600 py-3"><Text className="text-center font-bold text-white">Retry saving</Text></TouchableOpacity></View> : null}
            {saved ? <Text className="mt-4 text-center font-semibold text-emerald-700">Saved to Wellness test history</Text> : null}
            <TouchableOpacity onPress={resetFlow} className="mt-5 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Repeat activity</Text></TouchableOpacity>
            <TouchableOpacity onPress={onBack} className="mt-3 rounded-full border border-blue-200 bg-blue-50 py-4"><Text className="text-center font-semibold text-blue-700">Back to Health Tests</Text></TouchableOpacity>
        </View></ScrollView>
    </View>;
}
