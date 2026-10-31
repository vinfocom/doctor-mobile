import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Check, Eye, Info, Lightbulb } from 'lucide-react-native';
import { chooseColorVisionQuestions, colorVisionOptions, COLOR_VISION_PRACTICE, type ColorVisionPlate } from '../lib/colorVisionContent';
import type { CheckResult } from './WellnessCheckScreen';

type Answer = { plate_id: string; level: 1 | 2 | 3; selected_value: number; correct_value: number; correct: boolean };
type Page = 'instructions' | 'practice' | 'test' | 'result';

const INSTRUCTIONS = [
    { title: 'Look at the plate', body: 'Choose the number you can see.' },
    { title: 'Pick one number', body: 'Select one of four number options. Use comfortable screen brightness.' },
];

export default function WellnessColorVisionTestScreen({
    onBack,
    onComplete,
    recentPlateIds = [],
    onPlateShown = () => undefined,
}: {
    onBack: () => void;
    onComplete: (result: CheckResult) => Promise<void>;
    recentPlateIds?: string[];
    onPlateShown?: (plateId: string) => void;
}) {
    const [page, setPage] = useState<Page>('instructions');
    const [instructionIndex, setInstructionIndex] = useState(0);
    const [practiceOptions] = useState(() => colorVisionOptions(COLOR_VISION_PRACTICE.answer, COLOR_VISION_PRACTICE.level));
    const [practiceSelection, setPracticeSelection] = useState<number | null>(null);
    const [saveConsent, setSaveConsent] = useState(false);
    const [questions, setQuestions] = useState<ColorVisionPlate[]>([]);
    const [questionOptions, setQuestionOptions] = useState<number[]>([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [selectedValue, setSelectedValue] = useState<number | null>(null);
    const [answers, setAnswers] = useState<Answer[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState('');
    const shownIds = useRef(new Set<string>());
    const savingRef = useRef(false);

    const currentPlate = questions[questionIndex];
    const questionInLevel = currentPlate
        ? questions.slice(0, questionIndex + 1).filter((plate) => plate.level === currentPlate.level).length
        : 0;

    useEffect(() => {
        if (page !== 'test' || !currentPlate || shownIds.current.has(currentPlate.id)) return;
        shownIds.current.add(currentPlate.id);
        onPlateShown(currentPlate.id);
    }, [currentPlate, onPlateShown, page]);

    const startTest = () => {
        const selected = chooseColorVisionQuestions([...recentPlateIds, ...shownIds.current]);
        setQuestions(selected);
        setQuestionOptions(selected[0] ? colorVisionOptions(selected[0].answer, selected[0].level) : []);
        setQuestionIndex(0);
        setSelectedValue(null);
        setAnswers([]);
        setSaved(false);
        setSaveError('');
        setPage('test');
    };

    const saveResult = async (responses: Answer[]) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setSaveError('');
        const correct = responses.filter((answer) => answer.correct).length;
        const result: CheckResult = {
            result_value: correct,
            result_unit: 'of 6 plates',
            result_summary: `Identified ${correct} of 6 color-plate numbers. This informal screen is not a diagnosis; display, lighting, and viewing conditions may affect what you see.`,
            method_version: 'color-vision-plates-v1',
            result_details: { schema_version: 1, responses },
        };
        try {
            await onComplete(result);
            setSaved(true);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Could not save this result.');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const submitAnswer = () => {
        if (!currentPlate || selectedValue == null) return;
        const answer: Answer = {
            plate_id: currentPlate.id,
            level: currentPlate.level,
            selected_value: selectedValue,
            correct_value: currentPlate.answer,
            correct: selectedValue === currentPlate.answer,
        };
        const next = [...answers, answer];
        setAnswers(next);
        setSelectedValue(null);
        if (questionIndex === questions.length - 1) {
            setPage('result');
            void saveResult(next);
        } else {
            const nextQuestion = questions[questionIndex + 1];
            setQuestionOptions(colorVisionOptions(nextQuestion.answer, nextQuestion.level));
            setQuestionIndex((index) => index + 1);
        }
    };

    const back = () => {
        if (page === 'instructions') {
            if (instructionIndex > 0) setInstructionIndex((index) => index - 1);
            else onBack();
        } else if (page === 'practice') {
            setPracticeSelection(null);
            setPage('instructions');
            setInstructionIndex(INSTRUCTIONS.length - 1);
        } else if (page === 'test') {
            onBack();
        } else {
            onBack();
        }
    };

    const retake = () => {
        setSaveConsent(false);
        setInstructionIndex(0);
        setPracticeSelection(null);
        setQuestions([]);
        setQuestionIndex(0);
        setSelectedValue(null);
        setAnswers([]);
        setSaved(false);
        setSaveError('');
        setPage('instructions');
    };

    return <View className="flex-1 bg-slate-50">
        <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3">
            <TouchableOpacity onPress={back} className="mb-3 flex-row items-center" accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">{page === 'test' ? 'Exit test' : 'Health Tests'}</Text></TouchableOpacity>
            <Text className="text-2xl font-bold text-white">{page === 'result' ? 'Color vision result' : 'Color Vision Check'}</Text>
            <Text className="mt-1 text-blue-100">{page === 'test' && currentPlate ? `Level ${currentPlate.level} · Question ${questionInLevel} of 2` : 'A short plate-number check'}</Text>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 28 }}>
            {page === 'instructions' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <View className="mb-5 flex-row justify-center gap-2">{[0, 1, 2].map((step) => <View key={step} className={`h-2 rounded-full ${step === instructionIndex ? 'w-8 bg-blue-600' : 'w-2 bg-blue-100'}`} />)}</View>
                <View className="mb-5 h-36 items-center justify-center rounded-2xl">{instructionIndex === 0 ? <Eye size={60} color="#7c3aed" /> : <Lightbulb size={60} color="#7c3aed" />}</View>
                <Text className="text-2xl font-bold text-slate-900">{INSTRUCTIONS[instructionIndex].title}</Text>
                <Text className="mt-3 text-base leading-6 text-slate-600">{INSTRUCTIONS[instructionIndex].body}</Text>
                <Text className="mt-5 text-sm font-semibold text-blue-700">{instructionIndex + 1} / 3</Text>
                <TouchableOpacity onPress={() => instructionIndex < INSTRUCTIONS.length - 1 ? setInstructionIndex((index) => index + 1) : setPage('practice')} className="mt-4 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">{instructionIndex < INSTRUCTIONS.length - 1 ? 'Next' : 'Try a practice plate'}</Text></TouchableOpacity>
            </View> : null}

            {page === 'practice' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <Text className="mb-3 text-center text-sm font-semibold text-blue-700">3 / 3 · Practice</Text>
                <Image source={COLOR_VISION_PRACTICE.image} resizeMode="contain" style={{ width: '100%', height: 280 }} accessibilityLabel="Practice color plate showing a number" />
                <Text className="mt-2 text-center text-lg font-bold text-slate-900">Which number do you see?</Text>
                <View className="mt-4 flex-row flex-wrap justify-between">{practiceOptions.map((value, index) => <TouchableOpacity key={`${value}-${index}`} onPress={() => setPracticeSelection(value)} accessibilityRole="button" accessibilityState={{ selected: practiceSelection === value }} className="mb-3 h-14 w-[48%] items-center justify-center rounded-2xl border-2" style={{ borderColor: practiceSelection === value ? '#7c3aed' : '#ede9fe', backgroundColor: practiceSelection === value ? '#f3e8ff' : '#faf5ff' }}><Text className="text-xl font-bold text-violet-800">{value}</Text></TouchableOpacity>)}</View>
                {practiceSelection != null ? <View className={`rounded-2xl p-3 ${practiceSelection === COLOR_VISION_PRACTICE.answer ? 'bg-emerald-50' : 'bg-amber-50'}`}><Text className={`text-center font-bold ${practiceSelection === COLOR_VISION_PRACTICE.answer ? 'text-emerald-800' : 'text-amber-900'}`}>{practiceSelection === COLOR_VISION_PRACTICE.answer ? 'Correct — the plate shows 12.' : 'Not quite — the plate shows 12.'}</Text></View> : null}
                <TouchableOpacity onPress={() => setSaveConsent((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: saveConsent }} className="mt-4 flex-row items-center"><View className={`mr-2 h-5 w-5 items-center justify-center rounded border ${saveConsent ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white'}`}>{saveConsent ? <Text className="text-xs font-bold text-white">✓</Text> : null}</View><Text className="flex-1 text-xs leading-4 text-slate-600">I agree to save this result in Wellness history. It is not a diagnosis.</Text></TouchableOpacity>
                <TouchableOpacity disabled={practiceSelection == null || !saveConsent} onPress={startTest} className={`mt-4 rounded-full py-4 ${practiceSelection != null && saveConsent ? 'bg-blue-600' : 'bg-slate-300'}`}><Text className="text-center font-bold text-white">{practiceSelection == null ? 'Choose an answer' : 'Start 6-question test'}</Text></TouchableOpacity>
            </View> : null}

            {page === 'test' && currentPlate ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <View className="mb-3 flex-row items-center justify-between"><Text className="text-sm font-semibold text-slate-600">Question {questionInLevel} of 2</Text><Text className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-800">Level {currentPlate.level} · {currentPlate.level === 1 ? 'Easy' : currentPlate.level === 2 ? 'Moderate' : 'Challenging'}</Text></View>
                <View className="h-2 overflow-hidden rounded-full bg-blue-50"><View className="h-full rounded-full bg-violet-500" style={{ width: `${((questionIndex + 1) / 6) * 100}%` }} /></View>
                <Image source={currentPlate.image} resizeMode="contain" style={{ width: '100%', height: 280, marginTop: 10 }} accessibilityLabel={`Color vision plate, question ${questionIndex + 1}`} />
                <Text className="mt-2 text-center text-lg font-bold text-slate-900">Which number do you see?</Text>
                <View className="mt-4 flex-row flex-wrap justify-between">{questionOptions.map((value, index) => <TouchableOpacity key={`${value}-${index}`} onPress={() => setSelectedValue(value)} accessibilityRole="button" accessibilityState={{ selected: selectedValue === value }} className="mb-3 h-14 w-[48%] items-center justify-center rounded-2xl border-2" style={{ borderColor: selectedValue === value ? '#7c3aed' : '#dbeafe', backgroundColor: selectedValue === value ? '#f3e8ff' : '#f8fbff' }}><Text className="text-xl font-bold text-slate-900">{value}</Text></TouchableOpacity>)}</View>
                <TouchableOpacity disabled={selectedValue == null} onPress={submitAnswer} className={`mt-2 rounded-full py-4 ${selectedValue == null ? 'bg-slate-300' : 'bg-blue-600'}`}><Text className="text-center font-bold text-white">{questionIndex === 5 ? 'See result' : 'Next plate'}</Text></TouchableOpacity>
            </View> : null}

            {page === 'result' ? <View className="rounded-3xl bg-white p-5 shadow-sm">
                <View className="items-center rounded-2xl bg-violet-50 p-5"><Check size={38} color="#7c3aed" /><Text className="mt-2 text-lg font-bold text-slate-900">{saving ? 'Saving result…' : saved ? 'Check complete' : 'Result not saved yet'}</Text><Text className="mt-2 text-4xl font-extrabold text-violet-800">{answers.filter((answer) => answer.correct).length} / 6</Text><Text className="mt-1 text-center text-slate-600">plates identified</Text></View>
                <View className="mt-4 rounded-2xl bg-amber-50 p-4"><Info size={19} color="#b45309" /><Text className="mt-2 leading-5 text-amber-900">Informal color-plate activity only. Display, brightness, and viewing conditions affect results. This does not diagnose a color-vision condition.</Text></View>
                {saveError ? <Text className="mt-3 text-center text-sm text-rose-700">{saveError}</Text> : null}
                {saving ? <ActivityIndicator className="mt-4" color="#2563eb" /> : !saved ? <TouchableOpacity onPress={() => void saveResult(answers)} className="mt-4 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Retry saving</Text></TouchableOpacity> : null}
                <TouchableOpacity onPress={retake} className="mt-4 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Retake check</Text></TouchableOpacity>
                <TouchableOpacity onPress={onBack} className="mt-3 rounded-full bg-blue-50 py-4"><Text className="text-center font-semibold text-blue-700">Back to Health Tests</Text></TouchableOpacity>
            </View> : null}
        </ScrollView>
    </View>;
}
