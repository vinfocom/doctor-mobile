import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Check, Ear, Headphones, Info, Waves, X } from 'lucide-react-native';
import ToneAudio, { type ToneEar } from '../../modules/dapto-tone-audio/src';
import type { CheckResult } from './WellnessCheckScreen';

const FREQUENCIES = [250, 500, 1000, 2000, 4000, 8000] as const;
const TONE_MS = 650;
const QUIET_GAP_MS = 900;
const LEVELS = [0.06, 0.09] as const; // Digital gain only; not calibrated dB SPL.
type EarResults = Record<number, { heard: boolean; trials: number }>;
type Results = { left: EarResults; right: EarResults; catchTrials: Record<ToneEar, boolean | null> };
type Trial = { ear: ToneEar; frequencyIndex: number; silent: boolean; attempt: number };

const INITIAL_RESULTS: Results = { left: {}, right: {}, catchTrials: { left: null, right: null } };
const INSTRUCTIONS = [
    { icon: Waves, title: 'A short tone check', body: 'Listen for each tone and tap “I heard it” when you hear one. Some trials are silent.' },
    { icon: Headphones, title: 'Headphones & volume', body: 'Use wired or stereo headphones; phone speakers cannot separate ears reliably. Set media volume to maximum.' },
    { icon: Ear, title: 'Find a quiet place', body: 'Choose a quiet place. Stop if any tone feels uncomfortable.' },
    { icon: Ear, title: 'Test each ear', body: 'We’ll test your left and right ears separately. Tap only when you hear a tone.' },
];
const INSTRUCTION_IMAGES: (number | null)[] = [
    require('../../assets/wellness/hearing_frequency_tones.png'),
    require('../../assets/wellness/hearing_headphones_setup.png'),
    require('../../assets/wellness/hearing_quiet_place.png'),
    require('../../assets/wellness/hearing_left_right.png'),
];

export default function WellnessHearingTestScreen({ onBack, onComplete }: { onBack: () => void; onComplete: (result: CheckResult) => Promise<void> }) {
    const [page, setPage] = useState<'instructions' | 'ready' | 'test' | 'result'>('instructions');
    const [instructionIndex, setInstructionIndex] = useState(0);
    const [confirmations, setConfirmations] = useState({ headphones: false, volume: false, quiet: false });
    const [saveConsent, setSaveConsent] = useState(false);
    const [routeError, setRouteError] = useState('');
    const [phase, setPhase] = useState<'playing' | 'respond'>('playing');
    const [trial, setTrial] = useState<Trial>({ ear: 'left', frequencyIndex: 0, silent: false, attempt: 0 });
    const [results, setResults] = useState<Results>(INITIAL_RESULTS);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [audioError, setAudioError] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [falsePositive, setFalsePositive] = useState(false);
    const resultRef = useRef<Results>(INITIAL_RESULTS);
    const busyRef = useRef(false);
    const leavingRef = useRef(false);
    const catchPositionsRef = useRef<Record<ToneEar, number>>({ left: 3, right: 3 });

    useEffect(() => () => { leavingRef.current = true; void ToneAudio.stopTone().catch(() => undefined); void ToneAudio.cleanup().catch(() => undefined); }, []);

    useEffect(() => {
        const subscription = ToneAudio.addListener('onAudioUnavailable', ({ reason }) => {
            if (page !== 'test') return;
            leavingRef.current = true;
            setIsPlaying(false); setAudioError(reason); setPage('instructions');
            void ToneAudio.stopTone().catch(() => undefined); void ToneAudio.cleanup().catch(() => undefined);
        });
        return () => subscription.remove();
    }, [page]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active' && page === 'test') {
                leavingRef.current = true;
                setAudioError('Audio stopped because the app was interrupted. Return to the instructions and start again.');
                setPage('instructions');
                void ToneAudio.stopTone().catch(() => undefined);
                void ToneAudio.cleanup().catch(() => undefined);
            }
        });
        return () => subscription.remove();
    }, [page]);

    const enterTest = async () => {
        if (!ToneAudio.isAvailable) {
            setRouteError('Tone testing requires the Dapto development or store build. You can continue using the rest of Wellness in Expo Go.');
            return;
        }
        if (busyRef.current) return;
        busyRef.current = true;
        leavingRef.current = false;
        setRouteError(''); setAudioError('');
        try {
            const route = await ToneAudio.prepare();
            if (!route.headphonesConnected || !route.stereoOutput) {
                setRouteError('A supported stereo headphone output was not detected. Connect headphones and try again. The app cannot verify channel isolation at your ears.');
                await ToneAudio.cleanup();
                return;
            }
            resultRef.current = { left: {}, right: {}, catchTrials: { left: null, right: null } };
            catchPositionsRef.current = { left: [2, 3, 4][Math.floor(Math.random() * 3)], right: [2, 3, 4][Math.floor(Math.random() * 3)] };
            setResults(resultRef.current); setSaved(false); setSaveError(''); setFalsePositive(false);
            setTrial({ ear: 'left', frequencyIndex: 0, silent: false, attempt: 0 }); setPhase('playing'); setPage('test');
            await runTone({ ear: 'left', frequencyIndex: 0, silent: false, attempt: 0 });
        } catch (error) {
            setRouteError(error instanceof Error ? error.message : 'Native audio is unavailable. Install the rebuilt Dapto development app to run this test.');
            await ToneAudio.cleanup().catch(() => undefined);
        } finally { busyRef.current = false; }
    };

    const runTone = async (current: Trial) => {
        if (current.silent) {
            setIsPlaying(false); setPhase('respond');
            return;
        }
        setIsPlaying(true); setPhase('playing');
        try {
            await ToneAudio.playTone(FREQUENCIES[current.frequencyIndex], current.ear, LEVELS[current.attempt], TONE_MS);
            if (leavingRef.current) return;
            await new Promise((resolve) => setTimeout(resolve, TONE_MS));
            if (leavingRef.current) return;
            setIsPlaying(false);
            await new Promise((resolve) => setTimeout(resolve, QUIET_GAP_MS));
            if (!leavingRef.current) { setIsPlaying(false); setPhase('respond'); }
        } catch (error) {
            leavingRef.current = true;
            setIsPlaying(false);
            const message = error instanceof Error ? error.message : 'Audio route changed or playback failed. The screening has stopped.';
            setAudioError(message); setPage('instructions');
            await ToneAudio.cleanup().catch(() => undefined);
        }
    };

    const advance = async (heard: boolean) => {
        if (busyRef.current || page !== 'test' || phase !== 'respond') return;
        busyRef.current = true;
        try {
            const current = trial;
            let updated = resultRef.current;
            if (current.silent) {
                const nextCatch = { ...updated.catchTrials, [current.ear]: heard };
                updated = { ...updated, catchTrials: nextCatch };
                resultRef.current = updated; setResults(updated); setFalsePositive(heard);
                await new Promise((resolve) => setTimeout(resolve, 650));
            } else if (heard || current.attempt >= LEVELS.length - 1) {
                const side = { ...updated[current.ear], [FREQUENCIES[current.frequencyIndex]]: { heard, trials: current.attempt + 1 } };
                updated = { ...updated, [current.ear]: side };
                resultRef.current = updated; setResults(updated);
            } else {
                const replay = { ...current, attempt: current.attempt + 1 };
                setTrial(replay);
                await new Promise((resolve) => setTimeout(resolve, QUIET_GAP_MS));
                await runTone(replay);
                return;
            }

            const isLastFrequency = current.frequencyIndex === FREQUENCIES.length - 1;
            if (current.silent) {
                const next: Trial = { ear: current.ear, frequencyIndex: current.frequencyIndex, silent: false, attempt: 0 };
                setTrial(next); await new Promise((resolve) => setTimeout(resolve, QUIET_GAP_MS)); await runTone(next); return;
            }

            if (isLastFrequency && current.ear === 'left') {
                const next = { ear: 'right' as const, frequencyIndex: 0, silent: false, attempt: 0 };
                setTrial(next); await new Promise((resolve) => setTimeout(resolve, QUIET_GAP_MS)); await runTone(next); return;
            }
            if (isLastFrequency && current.ear === 'right') { await finish(updated); return; }

            const nextIndex = current.frequencyIndex + 1;
            const next: Trial = { ear: current.ear, frequencyIndex: nextIndex, silent: current.frequencyIndex === catchPositionsRef.current[current.ear], attempt: 0 };
            setTrial(next);
            await new Promise((resolve) => setTimeout(resolve, QUIET_GAP_MS));
            await runTone(next);
        } finally { busyRef.current = false; }
    };

    const finish = async (finalResults: Results) => {
        setPage('result'); setIsPlaying(false); setSaving(true); setSaveError('');
        await ToneAudio.cleanup().catch(() => undefined);
        const heardCount = FREQUENCIES.reduce((count, hz) => count + Number(Boolean(finalResults.left[hz]?.heard)) + Number(Boolean(finalResults.right[hz]?.heard)), 0);
        const details = {
            schema_version: 1,
            frequencies: FREQUENCIES.map((hz) => ({ hz, left: finalResults.left[hz], right: finalResults.right[hz] })),
            catch_trials: finalResults.catchTrials,
        };
        try {
            await onComplete({
                result_value: heardCount,
                result_unit: 'of 12 tones reported heard',
                result_summary: `Reported hearing ${heardCount} of 12 tones across left and right channel playback. ${finalResults.catchTrials.left || finalResults.catchTrials.right ? 'At least one silent check trial was reported as audible; interpret responses cautiously. ' : ''}This is an indicative, uncalibrated screening and does not provide hearing thresholds or a diagnosis.`,
                method_version: 'pure-tone-screen-v1',
                result_details: details,
            });
            setSaved(true);
        } catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save your result.'); }
        finally { setSaving(false); }
    };

    const reset = () => {
        setPage('instructions'); setInstructionIndex(0); setResults(INITIAL_RESULTS); resultRef.current = INITIAL_RESULTS;
        setSaved(false); setSaveError(''); setAudioError(''); setRouteError(''); setFalsePositive(false);
        setConfirmations({ headphones: false, volume: false, quiet: false });
        setSaveConsent(false);
        void ToneAudio.cleanup().catch(() => undefined);
    };

    const stop = async () => { leavingRef.current = true; await ToneAudio.stopTone().catch(() => undefined); await ToneAudio.cleanup().catch(() => undefined); reset(); };
    const current = INSTRUCTIONS[instructionIndex];
    const answeredCount = FREQUENCIES.filter((hz) => results[trial.ear][hz] != null).length;

    return <View className="flex-1 bg-slate-50">
        <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3">
            <TouchableOpacity onPress={() => page === 'test' ? void stop() : page === 'ready' ? setPage('instructions') : page === 'instructions' && instructionIndex > 0 ? setInstructionIndex((i) => i - 1) : onBack()} className="mb-3 flex-row items-center" accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">{page === 'test' ? 'Stop test' : 'Health Tests'}</Text></TouchableOpacity>
            <Text className="text-2xl font-bold text-white">{page === 'result' ? 'Hearing result' : 'Hearing Screening'}</Text>
            <Text className="mt-1 text-blue-100">{page === 'test' ? `${trial.ear === 'left' ? 'Left' : 'Right'} ear · ${answeredCount + 1} of 6` : 'A short tone check for each ear'}</Text>
        </View>
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 30 }}>
            {page === 'instructions' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <View className="mb-4 flex-row justify-center gap-2">{INSTRUCTIONS.map((_, i) => <View key={i} className={`h-2 rounded-full ${i === instructionIndex ? 'w-8 bg-blue-600' : 'w-2 bg-blue-100'}`} />)}</View>
                <View className="mb-5 h-40 items-center justify-center overflow-hidden rounded-2xl">{INSTRUCTION_IMAGES[instructionIndex] ? <Image source={INSTRUCTION_IMAGES[instructionIndex]!} resizeMode="contain" style={{ width: '100%', height: '100%' }} /> : <current.icon size={62} color="#059669" strokeWidth={1.7} />}</View>
                <Text className="text-2xl font-bold text-slate-900">{current.title}</Text>
                <Text className="mt-3 text-base leading-6 text-slate-600">{current.body}</Text>
                <Text className="mt-5 text-sm font-semibold text-blue-700">{instructionIndex + 1} / 5</Text>
                <TouchableOpacity onPress={() => instructionIndex === INSTRUCTIONS.length - 1 ? setPage('ready') : setInstructionIndex((i) => i + 1)} className="mt-4 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">{instructionIndex === INSTRUCTIONS.length - 1 ? 'Continue' : 'Next'}</Text></TouchableOpacity>
                {instructionIndex > 0 ? <TouchableOpacity onPress={() => setInstructionIndex((i) => i - 1)} className="mt-3 rounded-full bg-blue-50 py-3"><Text className="text-center font-semibold text-blue-700">Previous</Text></TouchableOpacity> : null}
                {audioError ? <Notice tone="error" text={audioError} /> : null}
            </View> : null}

            {page === 'ready' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <Text className="mb-3 text-center text-sm font-semibold text-blue-700">5 / 5</Text>
                <View className="mb-4 h-36 items-center justify-center overflow-hidden rounded-2xl"><Image source={require('../../assets/wellness/hearing_ready.png')} resizeMode="contain" style={{ width: '100%', height: '100%' }} /></View>
                <Text className="text-2xl font-bold text-slate-900">Ready to begin?</Text>
                <Text className="mt-2 leading-6 text-slate-600">Confirm each setup step. Dapto cannot verify these settings.</Text>
                <ConfirmRow title="Headphones connected" checked={confirmations.headphones} onPress={() => setConfirmations((x) => ({ ...x, headphones: !x.headphones }))} />
                <ConfirmRow title="Media volume set to maximum" checked={confirmations.volume} onPress={() => setConfirmations((x) => ({ ...x, volume: !x.volume }))} />
                <ConfirmRow title="I’m in a quiet place and comfortable to continue" checked={confirmations.quiet} onPress={() => setConfirmations((x) => ({ ...x, quiet: !x.quiet }))} />
                <TouchableOpacity onPress={() => setSaveConsent((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: saveConsent }} className="mt-4 flex-row items-center"><View className={`mr-2 h-5 w-5 items-center justify-center rounded border ${saveConsent ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white'}`}>{saveConsent ? <Text className="text-xs font-bold text-white">✓</Text> : null}</View><Text className="flex-1 text-xs leading-4 text-slate-600">I agree to save this result in Wellness history. It is not a diagnosis.</Text></TouchableOpacity>
                {!ToneAudio.isAvailable ? <Notice tone="info" text="Tone testing needs the Dapto development or store app. Other Wellness activities remain available in Expo Go." /> : null}
                <TouchableOpacity disabled={!ToneAudio.isAvailable || !confirmations.headphones || !confirmations.volume || !confirmations.quiet || !saveConsent || busyRef.current} onPress={() => void enterTest()} className={`mt-5 rounded-full py-4 ${ToneAudio.isAvailable && confirmations.headphones && confirmations.volume && confirmations.quiet && saveConsent ? 'bg-blue-600' : 'bg-slate-300'}`}><Text className="text-center font-bold text-white">Start Test</Text></TouchableOpacity>
                {routeError ? <Notice tone="error" text={routeError} /> : null}
                <View className="mt-4 flex-row rounded-2xl bg-amber-50 p-3"><Info size={18} color="#b45309" /><Text className="ml-2 flex-1 text-sm leading-5 text-amber-900">If no supported stereo headphone route is detected, the test will not start. Channel separation and sound level at your ears cannot be verified.</Text></View>
            </View> : null}

            {page === 'test' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <View className="h-2.5 overflow-hidden rounded-full bg-blue-50"><View className="h-full rounded-full bg-emerald-400" style={{ width: `${((trial.ear === 'left' ? 0 : 6) + answeredCount) / 12 * 100}%` }} /></View>
                <View className="mt-5 items-center rounded-3xl bg-emerald-50 px-4 py-8">
                    <View className={`h-28 w-28 items-center justify-center rounded-full ${isPlaying ? 'bg-emerald-100' : 'bg-white'}`}><Ear size={54} color="#059669" /></View>
                    <Text className="mt-3 text-lg font-bold text-slate-900">{trial.ear === 'left' ? 'Left ear' : 'Right ear'}</Text>
                    {trial.silent ? <Text className="mt-2 text-center text-slate-600">Quiet check trial</Text> : <Text className="mt-2 text-3xl font-extrabold text-blue-700">{FREQUENCIES[trial.frequencyIndex]} Hz</Text>}
                    <Text className="mt-2 text-slate-600">{isPlaying ? 'Tone playing…' : phase === 'respond' ? 'Did you hear a tone?' : 'Brief pause…'}</Text>
                    {isPlaying ? <View className="mt-3 flex-row items-center"><View className="mx-1 h-2 w-2 rounded-full bg-emerald-500" /><View className="mx-1 h-3 w-2 rounded-full bg-emerald-400" /><View className="mx-1 h-5 w-2 rounded-full bg-emerald-500" /><View className="mx-1 h-3 w-2 rounded-full bg-emerald-400" /></View> : null}
                </View>
                {phase === 'respond' ? <View className="mt-5 gap-3"><TouchableOpacity onPress={() => void advance(true)} className="flex-row items-center justify-center rounded-full bg-blue-600 py-4"><Check size={20} color="white" /><Text className="ml-2 font-bold text-white">I heard it</Text></TouchableOpacity><TouchableOpacity onPress={() => void advance(false)} className="flex-row items-center justify-center rounded-full bg-blue-50 py-4"><X size={20} color="#1d4ed8" /><Text className="ml-2 font-bold text-blue-700">I didn’t hear it</Text></TouchableOpacity></View> : <View className="mt-5 items-center rounded-full bg-slate-100 py-4"><Text className="font-semibold text-slate-500">Listen, then choose</Text></View>}
                {falsePositive ? <Text className="mt-3 text-center text-sm text-amber-800">Thanks. We’ll note this quiet check and continue.</Text> : null}
                <TouchableOpacity onPress={() => void stop()} className="mt-4 py-2"><Text className="text-center font-semibold text-rose-600">Stop test</Text></TouchableOpacity>
            </View> : null}

            {page === 'result' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <View className="items-center rounded-2xl bg-emerald-50 p-5"><Check size={38} color="#059669" /><Text className="mt-2 text-lg font-bold text-slate-900">{saved ? 'Screen complete' : saving ? 'Saving result…' : 'Result not saved yet'}</Text><Text className="mt-2 text-3xl font-extrabold text-blue-700">{FREQUENCIES.reduce((n, hz) => n + Number(Boolean(results.left[hz]?.heard)) + Number(Boolean(results.right[hz]?.heard)), 0)} / 12</Text><Text className="mt-1 text-center text-slate-600">tones reported heard</Text></View>
                {(['left', 'right'] as const).map((side) => <View key={side} className="mt-4 rounded-2xl bg-slate-50 p-4"><Text className="mb-2 font-bold capitalize text-slate-900">{side} ear · reported responses</Text>{FREQUENCIES.map((hz) => <View key={hz} className="flex-row items-center justify-between border-b border-slate-200 py-2"><Text className="text-slate-700">{hz} Hz</Text><Text className="font-semibold text-slate-800">{results[side][hz]?.heard ? 'Heard' : 'Not heard'}</Text></View>)}</View>)}
                <Notice tone="info" text="Indicative screening only. Digital output is not calibrated to dB HL or sound pressure at your ears. Headphones and device routing may affect results. This is not a diagnosis; seek a professional hearing assessment if concerned." />
                {saving ? <Text className="mt-3 text-center text-slate-500">Saving to Wellness history…</Text> : null}
                {saveError ? <Notice tone="error" text={saveError} /> : null}
                {!saved && !saving ? <TouchableOpacity onPress={() => void finish(results)} className="mt-4 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Retry saving</Text></TouchableOpacity> : null}
                <TouchableOpacity onPress={reset} className="mt-4 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Retake test</Text></TouchableOpacity>
                <TouchableOpacity onPress={onBack} className="mt-3 rounded-full bg-blue-50 py-4"><Text className="text-center font-semibold text-blue-700">Back to Health Tests</Text></TouchableOpacity>
            </View> : null}
        </ScrollView>
    </View>;
}

function ConfirmRow({ title, checked, onPress }: { title: string; checked: boolean; onPress: () => void }) {
    return <TouchableOpacity onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} className="mt-3 flex-row items-center rounded-2xl bg-slate-50 px-4 py-4"><View className={`mr-3 h-6 w-6 items-center justify-center rounded-md ${checked ? 'bg-emerald-500' : 'border-2 border-slate-300 bg-white'}`}>{checked ? <Check size={16} color="white" /> : null}</View><Text className="flex-1 font-semibold text-slate-800">{title}</Text></TouchableOpacity>;
}

function Notice({ text, tone }: { text: string; tone: 'error' | 'info' }) {
    return <View className={`mt-4 rounded-2xl p-4 ${tone === 'error' ? 'bg-rose-50' : 'bg-amber-50'}`}><Text className={`leading-5 ${tone === 'error' ? 'text-rose-800' : 'text-amber-900'}`}>{text}</Text></View>;
}
