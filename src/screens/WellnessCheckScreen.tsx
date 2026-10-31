import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Activity, ArrowLeft, Check, ChevronRight, Ear, Eye, Heart, Info, Moon } from 'lucide-react-native';
import { STRESS_COPING_QUESTION, WELLNESS_ANSWER_OPTIONS, WELLNESS_TESTS, WELLNESS_TEST_QUESTIONS } from '../lib/wellnessContent';
import WellnessEyeTestScreen from './WellnessEyeTestScreen';
import WellnessHearingTestScreen from './WellnessHearingTestScreen';
import WellnessColorVisionTestScreen from './WellnessColorVisionTestScreen';

type FrequencyResponse = { label: string; score: number };
const FREQUENCY_RESPONSES: FrequencyResponse[] = [
    { label: 'Never', score: 0 },
    { label: 'Rarely', score: 1 },
    { label: 'Sometimes', score: 2 },
    { label: 'Often', score: 3 },
];
function shuffled<T>(items: T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
}

export type CheckResult = { result_value: number | null; result_unit: string | null; result_summary: string; method_version: string; result_details?: Record<string, unknown> | null };
type Props = { testId: string; onBack: () => void; onComplete: (result: CheckResult) => Promise<void>; recentColorVisionPlateIds?: string[]; onColorVisionPlateShown?: (plateId: string) => void };

export default function WellnessCheckScreen({ testId, onBack, onComplete, recentColorVisionPlateIds, onColorVisionPlateShown }: Props) {
    const test = WELLNESS_TESTS.find((item) => item.id === testId)!;
    // Standalone interactive tests (eye, hearing, and color vision) do not use
    // the questionnaire question bank.
    const questionBank = WELLNESS_TEST_QUESTIONS[testId] || [];
    const randomQuestionOrder = () => shuffled(questionBank).slice(0, 5);
    const usesFrequencyScale = testId === 'SLEEP' || testId === 'STRESS' || testId === 'GENERAL';
    const [sessionQuestions, setSessionQuestions] = useState(() => usesFrequencyScale ? randomQuestionOrder() : questionBank);
    const [sessionOptions, setSessionOptions] = useState(() => usesFrequencyScale ? questionBank.map(() => shuffled(FREQUENCY_RESPONSES)) : []);
    const questions = usesFrequencyScale ? sessionQuestions : questionBank;
    const [step, setStep] = useState(-1);
    const [saveConsent, setSaveConsent] = useState(false);
    const [answers, setAnswers] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<CheckResult | null>(null);
    const [pendingResult, setPendingResult] = useState<CheckResult | null>(null);
    const [saveError, setSaveError] = useState('');
    const savingRef = React.useRef(false);
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (testId === 'VISION' || testId === 'HEARING' || testId === 'COLOR_VISION') return;
        Animated.spring(progress, { toValue: step < 0 ? 0 : (step + 1) / Math.max(questions.length, 1), damping: 20, stiffness: 150, useNativeDriver: false }).start();
    }, [progress, questions.length, step, testId]);

    const persistResult = async (item: CheckResult) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true); setSaveError('');
        try { await onComplete(item); setResult(item); setPendingResult(null); }
        catch (error) { setPendingResult(item); setSaveError(error instanceof Error ? error.message : 'Could not save the result.'); }
        finally { savingRef.current = false; setSaving(false); }
    };

    const submit = async (nextAnswers: number[]) => {
        const total = testId === 'VISION'
            ? nextAnswers.filter((answer, index) => answer === (index + 1) % 4).length
            : nextAnswers.reduce((sum, value) => sum + value, 0);
        let summary = '';
        if (testId === 'VISION') summary = `Informal self-check: ${total} of ${questions.length} orientation choices matched. This is not a vision acuity score.`;
        else if (testId === 'HEARING') summary = `${nextAnswers.filter((value) => value >= 2).length} of ${questions.length} hearing concerns were reported. This self-check does not measure hearing.`;
        else if (testId === 'SLEEP') summary = `Sleep check-in: ${total} of ${questions.length * 3}. Higher scores mean sleep difficulties were reported more often. Informational only, not a diagnosis.`;
        else if (testId === 'STRESS') summary = `Stress check-in: ${total} of ${questions.length * 3}. Higher scores mean stress signs were reported more often. Informational only, not a diagnosis.`;
        else if (testId === 'GENERAL') summary = `Wellness check-in: ${total} of ${questions.length * 3}. Higher scores mean positive habits were reported more often. Informational only, not a diagnosis.`;
        else summary = `Personal wellness check-in: ${total} of ${questions.length * 3} points. This informal score is not validated and is not medical advice.`;
        const value = total;
        const unit = testId === 'VISION' ? 'of 5' : testId === 'HEARING' ? 'concerns' : usesFrequencyScale ? 'of 15' : testId === 'GENERAL' ? `of ${questions.length * 3}` : 'points';
        const methodVersion = testId === 'SLEEP' ? 'sleep-frequency-checkin-v2' : testId === 'STRESS' ? 'stress-frequency-checkin-v2' : testId === 'GENERAL' ? 'general-frequency-checkin-v2' : `${testId.toLowerCase()}-checkin-v1`;
        const item = { result_value: value, result_unit: unit, result_summary: summary, method_version: methodVersion };
        setPendingResult(item);
        await persistResult(item);
    };

    const answer = async (value: number) => {
        const next = [...answers, value]; setAnswers(next);
        if (step + 1 >= questions.length) await submit(next);
        else setStep((current) => current + 1);
    };

    if (testId === 'VISION') return <WellnessEyeTestScreen onBack={onBack} onComplete={onComplete} />;
    if (testId === 'HEARING') return <WellnessHearingTestScreen onBack={onBack} onComplete={onComplete} />;
    if (testId === 'COLOR_VISION') return <WellnessColorVisionTestScreen onBack={onBack} onComplete={onComplete} recentPlateIds={recentColorVisionPlateIds} onPlateShown={onColorVisionPlateShown} />;

    return (
        <View className="flex-1 bg-slate-50">
            <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3">
                <TouchableOpacity onPress={onBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">Health Tests</Text></TouchableOpacity>
                <Text className="text-2xl font-bold text-white">{result ? 'Screening result' : test.title}</Text>
                <Text className="mt-1 text-blue-100">Informational self-check · Not a diagnosis</Text>
            </View>
            <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}>
                {result ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                    <View className="items-center rounded-2xl bg-emerald-50 p-5"><Text className="text-4xl">✓</Text><Text className="mt-2 text-lg font-bold text-slate-900">Your result is saved</Text><Text className="mt-2 text-center text-2xl font-bold text-blue-700">{result.result_value == null ? 'Check-in complete' : `${result.result_value} ${result.result_unit}`}</Text><Text className="mt-3 text-center leading-5 text-slate-700">{result.result_summary}</Text></View>
                    {usesFrequencyScale ? <View className="mt-4 flex-row items-center justify-center rounded-2xl p-3" style={{ backgroundColor: test.bg }}>{testId === 'SLEEP' ? <Moon size={17} color={test.color} /> : testId === 'STRESS' ? <Heart size={17} color={test.color} /> : <Activity size={17} color={test.color} />}<Text className="ml-2 text-sm" style={{ color: test.color }}>Informational · Not validated · Not a diagnosis</Text></View> : <View className="mt-4 rounded-2xl bg-orange-50 p-4"><Text className="font-bold text-orange-900">Please remember</Text><Text className="mt-1 leading-5 text-orange-900">{test.disclaimer}</Text></View>}
                    <TouchableOpacity onPress={() => { setResult(null); setStep(-1); setAnswers([]); setSaveConsent(false); if (usesFrequencyScale) { const nextQuestions = randomQuestionOrder(); setSessionQuestions(nextQuestions); setSessionOptions(nextQuestions.map(() => shuffled(FREQUENCY_RESPONSES))); } }} className="mt-5 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Retake this check</Text></TouchableOpacity>
                    <TouchableOpacity onPress={onBack} className="mt-3 rounded-full border border-blue-200 bg-blue-50 py-4"><Text className="text-center font-semibold text-blue-700">Back to Health Tests</Text></TouchableOpacity>
                </View> : step === -1 ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                    <View className="mb-4 h-36 items-center justify-center rounded-2xl" style={{ backgroundColor: test.bg }}>{testId === 'VISION' ? <Eye size={64} color="#2563eb" /> : testId === 'HEARING' ? <Ear size={64} color="#059669" /> : testId === 'SLEEP' ? <Moon size={64} color="#7c3aed" /> : testId === 'STRESS' ? <Heart size={64} color="#db2777" /> : <Activity size={64} color="#ea580c" />}</View>
                    <Text className="text-xl font-bold text-slate-900">{usesFrequencyScale ? `A quick ${testId === 'SLEEP' ? 'sleep' : testId === 'STRESS' ? 'stress' : 'wellness'} check-in` : 'Before you begin'}</Text><Text className="mt-2 leading-6 text-slate-600">{usesFrequencyScale ? `Think about the past ${testId === 'GENERAL' ? '7 days' : '2 weeks'}. Choose how often each ${testId === 'SLEEP' ? 'sleep difficulty' : testId === 'STRESS' ? 'stress sign' : 'habit'} applied.` : `${test.subtitle}. Take it at your pace.`}</Text>
                    {testId === 'VISION' ? <Text className="mt-3 rounded-2xl bg-blue-50 p-4 leading-5 text-blue-900">Use your usual glasses if applicable. Hold your phone comfortably at eye level in a well-lit room. This screen is not calibrated for distance or size.</Text> : null}
                    {usesFrequencyScale ? <><View className="mt-4 flex-row flex-wrap justify-center gap-2">{FREQUENCY_RESPONSES.map((option) => <View key={option.score} className="rounded-full bg-violet-50 px-3 py-2"><Text className="text-xs font-semibold text-violet-800">{option.label}</Text></View>)}</View><View className="mt-3 flex-row items-center justify-center"><Info size={14} color="#7c3aed" /><Text className="ml-1 text-xs text-violet-800">Custom check-in · Not validated</Text></View></> : <View className="mt-4 rounded-2xl bg-orange-50 p-4"><Text className="font-semibold text-orange-900">Limitations</Text><Text className="mt-1 leading-5 text-orange-900">{test.disclaimer}</Text></View>}
                    <TouchableOpacity onPress={() => setSaveConsent((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: saveConsent }} className="mt-4 flex-row items-center"><View className={`mr-2 h-5 w-5 items-center justify-center rounded border ${saveConsent ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white'}`}>{saveConsent ? <Text className="text-xs font-bold text-white">✓</Text> : null}</View><Text className="flex-1 text-xs leading-4 text-slate-600">I agree to save this result in Wellness history. It is not a diagnosis.</Text></TouchableOpacity>
                    <TouchableOpacity disabled={!saveConsent} onPress={() => setStep(0)} className={`mt-4 rounded-full py-4 ${saveConsent ? 'bg-blue-600' : 'bg-slate-300'}`}><Text className="text-center font-bold text-white">{usesFrequencyScale ? 'Start 5 questions' : 'Start check-in'}</Text></TouchableOpacity>
                </View> : <View className="rounded-3xl bg-white p-5 shadow-sm">
                    <View className="h-2.5 overflow-hidden rounded-full bg-blue-50"><Animated.View className="h-full rounded-full bg-emerald-400" style={{ width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /></View>
                    <View className="mt-3 flex-row items-center justify-between"><Text className="text-sm font-semibold text-slate-600">Question {step + 1}</Text><Text className="text-sm font-bold text-blue-700">{step + 1}/{questions.length}</Text></View>
                    <Text className="mt-4 text-xl font-bold leading-7 text-slate-900">{questions[step]}</Text>
                    {testId === 'VISION' ? <View className="mt-5 flex-row flex-wrap justify-between">{['↑', '→', '↓', '←'].map((direction, index) => <TouchableOpacity key={direction} disabled={saving || Boolean(pendingResult)} onPress={() => void answer(index)} className="mb-3 h-14 w-[48%] items-center justify-center rounded-2xl bg-blue-50"><Text className="text-2xl font-bold text-blue-700">{direction}</Text></TouchableOpacity>)}</View> : <View className="mt-5 gap-3">{(testId === 'HEARING' ? ['No difficulty', 'A little difficulty', 'Some difficulty', 'A lot of difficulty'] : usesFrequencyScale ? sessionOptions[step] || FREQUENCY_RESPONSES : WELLNESS_ANSWER_OPTIONS).map((option, index) => {
                        const label = typeof option === 'string' ? option : option.label;
                        const rawScore = typeof option === 'string' ? index : option.score;
                        const score = testId === 'STRESS' && questions[step] === STRESS_COPING_QUESTION ? 3 - rawScore : rawScore;
                        return <TouchableOpacity key={`${label}-${index}`} disabled={saving || Boolean(pendingResult)} onPress={() => void answer(score)} activeOpacity={0.76} className="flex-row items-center rounded-2xl border border-slate-200 bg-blue-50 px-4 py-4"><View className="mr-3 h-7 w-7 items-center justify-center rounded-full bg-white"><Text className="text-xs font-bold text-blue-700">{String.fromCharCode(65 + index)}</Text></View><Text className="flex-1 font-semibold text-slate-800">{label}</Text><ChevronRight size={18} color="#2563eb" /></TouchableOpacity>;
                    })}</View>}
                    {saving ? <Text className="mt-3 text-center text-sm text-slate-500">Saving result…</Text> : null}
                    {saveError && pendingResult ? <View className="mt-3"><Text className="text-center text-sm text-rose-600">{saveError}</Text><TouchableOpacity onPress={() => void persistResult(pendingResult)} className="mt-3 rounded-full bg-blue-600 py-3"><Text className="text-center font-bold text-white">Retry saving</Text></TouchableOpacity></View> : null}
                    <View className="mt-4 flex-row items-center justify-center"><Info size={14} color="#64748b" /><Text className="ml-1 text-center text-xs text-slate-500">Informational only. This is not a diagnosis.</Text></View>
                </View>}
            </ScrollView>
        </View>
    );
}
