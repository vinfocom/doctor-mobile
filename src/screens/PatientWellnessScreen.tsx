import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Image, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Accessibility, Activity, Apple, ArrowLeft, Brain, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudRain, Droplets, Ear, Eye, Flame, Flower2, Grid3x3, Heart, HeartPulse, Info, Lightbulb, Minus, Moon, Music2, PersonStanding, Plus, RotateCcw, Shapes, ShieldPlus, Sparkles, Type, Volume2, VolumeX, Waves, Wind, X, Zap } from 'lucide-react-native';
import type { PatientTabParamList } from '../navigation/types';
import { listRecentWellnessExposures, listWellnessProgress, listWellnessTests, saveWellnessCompletion, saveWellnessExposure, saveWellnessTestResult, type WellnessCompletion, type WellnessTestResult } from '../api/wellness';
import { QUIZ_CATEGORIES, WELLNESS_GAMES, WELLNESS_QUIZ_QUESTIONS, WELLNESS_TESTS, type WellnessGame, type WellnessQuestion } from '../lib/wellnessContent';
import { COLOR_VISION_PLATE_BY_ID } from '../lib/colorVisionContent';
import WellnessGameScreen from './WellnessGameScreen';
import WellnessCheckScreen, { type CheckResult } from './WellnessCheckScreen';

type Page = 'home' | 'games' | 'tests' | 'relax' | 'quizzes' | 'history' | 'progress';
type Props = BottomTabScreenProps<PatientTabParamList, 'PatientWellness'>;
const CATEGORY_STYLE = {
    'Brain Games': { icon: Brain, tint: '#2563eb', bg: '#eaf4ff' },
    'Health Tests': { icon: Eye, tint: '#db2777', bg: '#fff0f7' },
    'Relax & Refresh': { icon: Flower2, tint: '#7c3aed', bg: '#f4efff' },
    'Health Quizzes': { icon: Lightbulb, tint: '#d97706', bg: '#fff6e7' },
};
const gamePalette = ['#fce7f3', '#e0f2fe', '#dcfce7', '#fef3c7', '#ede9fe', '#ffedd5'];
const shuffleItems = <T,>(items: T[]): T[] => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return shuffled;
};
const STRETCHES = [
    { title: 'Shoulder rolls', description: 'Sit tall and gently roll your shoulders back three times.', tip: 'Keep your back straight and move slowly.', image: require('../../assets/wellness/shoulder-rolls.png') },
    { title: 'Neck turns', description: 'Slowly turn your head a little to each side. Stop if it feels uncomfortable.', tip: 'Move gently and stay within a comfortable range.', image: require('../../assets/wellness/neck-turns.png') },
    { title: 'Arm across stretch', description: 'Reach one arm gently across your body, then switch sides. Stay within a comfortable range.', tip: 'You should feel a gentle stretch, not pain.', image: require('../../assets/wellness/arm-across-stretch.png') },
];
const SOUND_TRACKS = [
    { id: 'forest', label: 'Forest', source: require('../../assets/wellness/forest.mp3'), image: require('../../assets/wellness/forest.png'), icon: Flower2, tint: '#16815b', soft: '#e4f7ef', background: '#f5fbf7', header: '#e7f5ec' },
    { id: 'birds', label: 'Birdsong', source: require('../../assets/wellness/birds.mp3'), image: require('../../assets/wellness/birds.png'), icon: Music2, tint: '#a96a16', soft: '#fff5df', background: '#fffaf1', header: '#fff1d5' },
    { id: 'stream', label: 'Stream', source: require('../../assets/wellness/stream.mp3'), image: require('../../assets/wellness/stream.png'), icon: Droplets, tint: '#16849a', soft: '#e2f7fa', background: '#f3fbfc', header: '#def3f5' },
    { id: 'wind-chimes', label: 'Wind Chimes', source: require('../../assets/wellness/wind-chimes.mp3'), image: require('../../assets/wellness/wind-chimes.png'), icon: Wind, tint: '#7055ad', soft: '#f0eaff', background: '#faf8ff', header: '#eee8fa' },
    { id: 'rain', label: 'Gentle Rain', source: require('../../assets/wellness/rain.mp3'), image: require('../../assets/wellness/rain.png'), icon: CloudRain, tint: '#2859b7', soft: '#e5efff', background: '#f5f8ff', header: '#e7efff' },
    { id: 'soft-waves', label: 'Soft Waves', source: require('../../assets/wellness/soft-waves.mp3'), image: require('../../assets/wellness/soft-waves.png'), icon: Waves, tint: '#167b86', soft: '#e0f6f6', background: '#f3fbfb', header: '#def2f2' },
] as const;
type SoundChoice = (typeof SOUND_TRACKS)[number]['id'];

function Entrance({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: import('react-native').ViewStyle }) {
    const value = useRef(new Animated.Value(0)).current;
    useEffect(() => { const animation = Animated.spring(value, { toValue: 1, delay, damping: 19, stiffness: 170, useNativeDriver: true }); animation.start(); return () => animation.stop(); }, [delay, value]);
    return <Animated.View style={[style, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}

function localDateKey(date = new Date(), timeZone?: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).formatToParts(date);
    const part = (name: string) => parts.find((item) => item.type === name)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function streakFor(completions: WellnessCompletion[], activeDates: string[]) {
    const days = [...new Set(activeDates.map((item) => String(item).slice(0, 10)))].sort().reverse();
    if (!days.length) return { current: 0, days };
    const today = localDateKey(new Date(), completions[0]?.timezone || undefined);
    const utcDay = (value: string) => Date.parse(`${value}T00:00:00.000Z`);
    const latestGap = Math.round((utcDay(today) - utcDay(days[0])) / 86_400_000);
    if (latestGap > 1) return { current: 0, days };
    let current = 1;
    for (let index = 1; index < days.length; index += 1) {
        if (Math.round((utcDay(days[index - 1]) - utcDay(days[index])) / 86_400_000) !== 1) break;
        current += 1;
    }
    return { current, days };
}

export default function PatientWellnessScreen({ navigation }: Props) {
    const wellnessScrollRef = useRef<ScrollView>(null);
    const [page, setPage] = useState<Page>('home');
    const [gameFilter, setGameFilter] = useState('All');
    const [tests, setTests] = useState<WellnessTestResult[]>([]);
    const [testsCursor, setTestsCursor] = useState<string | null>(null);
    const [testsHaveMore, setTestsHaveMore] = useState(false);
    const [loadingOlderTests, setLoadingOlderTests] = useState(false);
    const loadingOlderTestsRef = useRef(false);
    const [completions, setCompletions] = useState<WellnessCompletion[]>([]);
    const [activeDates, setActiveDates] = useState<string[]>([]);
    const [gameExposureIds, setGameExposureIds] = useState<string[]>([]);
    const [quizExposureIds, setQuizExposureIds] = useState<string[]>([]);
    const [colorVisionExposureIds, setColorVisionExposureIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [game, setGame] = useState<WellnessGame | null>(null);
    const [gameContentId, setGameContentId] = useState('');
    const [testId, setTestId] = useState<string | null>(null);
    const [quizQuestions, setQuizQuestions] = useState<WellnessQuestion[]>([]);
    const [quizCategory, setQuizCategory] = useState('All');
    const [selectedHistory, setSelectedHistory] = useState<WellnessTestResult | null>(null);
    const [relaxActivity, setRelaxActivity] = useState<string | null>(null);
    const [isScreenFocused, setIsScreenFocused] = useState(() => navigation.isFocused());

    const load = useCallback(async () => {
        setError('');
        const [testsResult, progressResult, exposureResult] = await Promise.allSettled([
            listWellnessTests(), listWellnessProgress(), listRecentWellnessExposures(),
        ]);
        const failures: string[] = [];
        if (testsResult.status === 'fulfilled') {
            setTests(testsResult.value.results);
            setTestsCursor(testsResult.value.nextCursor);
            setTestsHaveMore(testsResult.value.hasMore);
        }
        else failures.push(`Test history: ${testsResult.reason instanceof Error ? testsResult.reason.message : 'Could not load.'}`);
        if (progressResult.status === 'fulfilled') {
            setCompletions(progressResult.value.completions);
            setActiveDates(progressResult.value.active_dates);
        } else failures.push(`Personal progress: ${progressResult.reason instanceof Error ? progressResult.reason.message : 'Could not load.'}`);
        if (exposureResult.status === 'fulfilled') {
            setGameExposureIds(exposureResult.value.games);
            setQuizExposureIds(exposureResult.value.quizzes);
            setColorVisionExposureIds(exposureResult.value.colorVision);
        } else failures.push(`Recently shown games and quizzes: ${exposureResult.reason instanceof Error ? exposureResult.reason.message : 'Could not load.'}`);
        setError(failures.join('\n'));
    }, []);
    const loadOlderTests = useCallback(async (): Promise<WellnessTestResult[]> => {
        if (!testsHaveMore || !testsCursor || loadingOlderTestsRef.current) return [];
        loadingOlderTestsRef.current = true;
        setLoadingOlderTests(true);
        try {
            const page = await listWellnessTests(testsCursor);
            setTests((current) => {
                const known = new Set(current.map((item) => String(item.result_id)));
                return [...current, ...page.results.filter((item) => !known.has(String(item.result_id)))];
            });
            setTestsCursor(page.nextCursor);
            setTestsHaveMore(page.hasMore);
            return page.results;
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Could not load older test results.');
            return [];
        } finally {
            loadingOlderTestsRef.current = false;
            setLoadingOlderTests(false);
        }
    }, [testsCursor, testsHaveMore]);
    useEffect(() => {
        const refresh = () => { setLoading(true); void load().finally(() => setLoading(false)); };
        const unsubscribeFocus = navigation.addListener('focus', () => { setIsScreenFocused(true); refresh(); });
        const unsubscribeBlur = navigation.addListener('blur', () => setIsScreenFocused(false));
        if (navigation.isFocused()) refresh();
        return () => { unsubscribeFocus(); unsubscribeBlur(); };
    }, [load, navigation]);

    const streak = useMemo(() => streakFor(completions, activeDates), [completions, activeDates]);
    useEffect(() => {
        wellnessScrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [page, selectedHistory?.result_id]);
    const goBack = useCallback(() => {
        if (game) { setGame(null); setPage('games'); return; }
        if (testId) { setTestId(null); setPage('tests'); return; }
        if (quizQuestions.length) { setQuizQuestions([]); setPage('quizzes'); return; }
        if (relaxActivity) { setRelaxActivity(null); setPage('relax'); return; }
        if (selectedHistory) { setSelectedHistory(null); return; }
        setPage('home');
    }, [game, testId, quizQuestions.length, relaxActivity, selectedHistory]);

    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!navigation.isFocused()) return false;
            if (testId === 'VISION') return false;
            const hasWellnessPage = page !== 'home' || Boolean(game || testId || quizQuestions.length || relaxActivity || selectedHistory);
            if (!hasWellnessPage) return false;
            goBack();
            return true;
        });
        return () => subscription.remove();
    }, [navigation, page, game, testId, quizQuestions.length, relaxActivity, selectedHistory, goBack]);

    const enterGame = (item: WellnessGame) => {
        const pool = Array.from({ length: 10 }, (_, index) => `${item.id}-puzzle-${String(index + 1).padStart(2, '0')}`);
        const notRecent = pool.filter((id) => !gameExposureIds.includes(id));
        const available = notRecent.length ? notRecent : pool;
        const id = available[Math.floor(Math.random() * available.length)];
        setGame(item); setGameContentId(id); setPage('games');
        setGameExposureIds((existing) => [...existing, id]);
        void saveWellnessExposure('GAME', id).catch(() => undefined);
    };

    const completeActivity = async (type: 'GAME' | 'QUIZ' | 'RELAX', id: string) => {
        try {
            const saved = await saveWellnessCompletion(type, id);
            const current = {
                completion_id: `local-${Date.now()}`,
                activity_type: type,
                activity_id: id,
                completed_at: new Date().toISOString(),
                completion_date_local: saved.completion_date_local,
                timezone: saved.timezone,
            } satisfies WellnessCompletion;
            setCompletions((previous) => [current, ...previous].slice(0, 250));
            setActiveDates((previous) => previous.includes(saved.completion_date_local) ? previous : [saved.completion_date_local, ...previous]);
            void listWellnessProgress().then((data) => { setCompletions(data.completions); setActiveDates(data.active_dates); }).catch(() => undefined);
        } catch (e) {
            Alert.alert('Progress not saved', e instanceof Error ? `${e.message} You can keep going, but this completion may not appear in your history or streak.` : 'You can keep going, but this completion may not appear in your history or streak.');
        }
    };

    const openQuiz = (category: string) => {
        setQuizCategory(category);
        const pool = WELLNESS_QUIZ_QUESTIONS.filter((item) => category === 'All' || item.category === category);
        const questionCount = Math.min(5, pool.length);
        const fresh = shuffleItems(pool.filter((item) => !quizExposureIds.includes(item.id)));
        const chosen = fresh.slice(0, questionCount);
        if (chosen.length < questionCount) {
            const chosenIds = new Set(chosen.map((item) => item.id));
            const recentlyShown = shuffleItems(pool.filter((item) => !chosenIds.has(item.id) && quizExposureIds.includes(item.id)));
            chosen.push(...recentlyShown.slice(0, questionCount - chosen.length));
        }
        if (!chosen.length) return;
        const sessionQuestions = Platform.OS === 'ios' ? chosen.map((item) => {
            const choices = shuffleItems(item.options.map((text, originalIndex) => ({ text, originalIndex })));
            return { ...item, options: choices.map((choice) => choice.text), answer: choices.findIndex((choice) => choice.originalIndex === item.answer) };
        }) : chosen;
        setQuizQuestions(sessionQuestions); setPage('quizzes');
    };

    const onCheckComplete = async (result: CheckResult) => {
        if (!testId) return;
        try {
            const saved = await saveWellnessTestResult({ test_type: testId, result_value: result.result_value, result_unit: result.result_unit, result_summary: result.result_summary, method_version: result.method_version, result_details: result.result_details });
            const item: WellnessTestResult = { result_id: saved.result_id, test_type: testId, completed_at: new Date().toISOString(), method_version: result.method_version, result_value: result.result_value, result_unit: result.result_unit, result_summary: result.result_summary, result_details: result.result_details };
            setTests((previous) => [item, ...previous]);
            void listWellnessTests().then((page) => { setTests(page.results); setTestsCursor(page.nextCursor); setTestsHaveMore(page.hasMore); }).catch(() => undefined);
        } catch (e) {
            Alert.alert('Result not saved', e instanceof Error ? e.message : 'Could not save this result. Please retry when connected.');
            throw e;
        }
    };

    if (game) return <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}><WellnessGameScreen key={`${game.id}-${gameContentId}`} game={game} contentId={gameContentId} onBack={() => { setGame(null); setPage('games'); }} onComplete={() => void completeActivity('GAME', game.id)} /></SafeAreaView>;
    if (testId) return <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}><WellnessCheckScreen testId={testId} onBack={() => { setTestId(null); setPage('tests'); }} onComplete={onCheckComplete} recentColorVisionPlateIds={colorVisionExposureIds} onColorVisionPlateShown={(id) => { setColorVisionExposureIds((old) => old.includes(id) ? old : [...old, id]); void saveWellnessExposure('COLOR_VISION', id).catch(() => undefined); }} /></SafeAreaView>;
    if (quizQuestions.length) return <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}><QuizSession category={quizCategory} questions={quizQuestions} onExposure={(id) => { setQuizExposureIds((old) => [...old, id]); void saveWellnessExposure('QUIZ', id).catch(() => undefined); }} onBack={() => setQuizQuestions([])} onFinish={() => { void completeActivity('QUIZ', `quiz-${quizCategory.toLowerCase().replace(/\s+/g, '-')}`); }} /></SafeAreaView>;
    if (relaxActivity) return <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}><RelaxSession key={relaxActivity} isScreenFocused={isScreenFocused} activityId={relaxActivity} onBack={() => setRelaxActivity(null)} onComplete={() => { void completeActivity('RELAX', relaxActivity); }} /></SafeAreaView>;

    return (
        <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
            <ScrollView ref={wellnessScrollRef} className="flex-1" contentContainerStyle={{ paddingBottom: 26 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />}>
                <View className="rounded-b-[30px] bg-blue-700 px-5 pb-6 pt-3">
                    {page !== 'home' ? <TouchableOpacity onPress={goBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">Wellness Hub</Text></TouchableOpacity> : <Text className="text-sm text-blue-100">Patient Portal</Text>}
                    <Text className="mt-1 text-3xl font-bold text-white">{pageTitle(page)}</Text>
                    <Text className="mt-1 text-base text-blue-100">{pageSubtitle(page)}</Text>
                </View>
                {error ? <Text className="mx-4 mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</Text> : null}
                {page === 'home' ? <>
                    <TouchableOpacity onPress={() => setPage('relax')} activeOpacity={0.84} className="mx-4 mt-4 min-h-[178px] overflow-hidden rounded-3xl bg-white p-5 shadow-sm">
                        <MindfulBreakIllustration /><Text className="text-xl font-bold text-slate-900">Take a mindful break</Text><Text className="mt-2 max-w-[56%] text-base leading-6 text-slate-600">Play, learn and relax while you wait.</Text><View className="mt-4 self-start rounded-full bg-blue-600 px-5 py-3"><Text className="font-semibold text-white">Explore</Text></View>
                    </TouchableOpacity>
                    <View className="mx-4 mt-4 flex-row flex-wrap justify-between" style={Platform.OS === 'ios' ? { rowGap: 12, alignContent: 'flex-start' } : undefined}>{(Object.keys(CATEGORY_STYLE) as Array<keyof typeof CATEGORY_STYLE>).map((title) => <CategoryCard key={title} title={title} onPress={() => setPage(pageForCategory(title))} />)}</View>
                    <SectionTitle title="Quick Play" action="See all" onPress={() => setPage('games')} />
                    {WELLNESS_GAMES.slice(0, 2).map((item, index) => <GameListCard key={item.id} game={item} index={index} onPress={() => enterGame(item)} />)}
                    <SectionTitle title="Your Progress" action="See all" onPress={() => setPage('progress')} />
                    <View className="mx-4 mt-3 flex-row rounded-3xl bg-white p-4 shadow-sm">
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View ${streak.current} day streak and active days`} onPress={() => setPage('progress')} className="flex-1"><ProgressMetric icon={<Flame size={28} color="#f97316" />} value={String(streak.current)} label="Day streak" /></TouchableOpacity>
                        <View className="mx-2 w-px bg-slate-200" /><TouchableOpacity accessibilityRole="button" accessibilityLabel="View recent activity days" onPress={() => setPage('progress')} className="flex-1"><ProgressMetric icon={<Flower2 size={28} color="#16a34a" />} value={`${completions.length}${completions.length >= 100 ? '+' : ''}`} label="Recent activities" /></TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setPage('history')} className="mx-4 mt-4 flex-row items-center rounded-3xl bg-white p-4 shadow-sm"><View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-pink-50"><HeartPulse size={22} color="#db2777" /></View><View className="flex-1"><Text className="font-bold text-slate-900">Health-test history</Text><Text className="mt-1 text-sm text-slate-600">Past screening results</Text></View><ChevronRight size={20} color="#475569" /></TouchableOpacity>
                </> : null}

                {page === 'games' ? <>
                    <View className="mx-4 mt-4 flex-row flex-wrap">{['All', 'Memory', 'Logic', 'Words', 'Focus'].map((label) => <TouchableOpacity key={label} onPress={() => setGameFilter(label)} className="mb-2 mr-2 rounded-full px-4 py-2" style={{ backgroundColor: gameFilter === label ? '#2563eb' : 'white' }}><Text className="text-sm font-semibold" style={{ color: gameFilter === label ? 'white' : '#475569' }}>{label}</Text></TouchableOpacity>)}</View>
                    {WELLNESS_GAMES.filter((item) => gameFilter === 'All' || (gameFilter === 'Memory' && item.kind === 'memory') || (gameFilter === 'Logic' && ['logic', 'sudoku', 'pattern'].includes(item.kind)) || (gameFilter === 'Words' && item.kind === 'word') || (gameFilter === 'Focus' && item.kind === 'reaction')).map((item, index) => <GameListCard key={item.id} game={item} index={index} onPress={() => enterGame(item)} />)}
                </> : null}

                {page === 'tests' ? <>
                    {WELLNESS_TESTS.map((item) => <TouchableOpacity key={item.id} onPress={() => setTestId(item.id)} activeOpacity={0.84} className="mx-4 mt-3 flex-row items-center rounded-3xl bg-white p-4 shadow-sm"><TestIcon testId={item.id} tint={item.color} bg={item.bg} /><View className="ml-3 flex-1"><Text className="font-bold text-slate-900">{item.title}</Text><Text className="mt-1 text-sm text-slate-600">{item.subtitle}</Text></View><ChevronRight size={19} color="#475569" /></TouchableOpacity>)}
                    <View className="mx-4 mt-3 rounded-2xl bg-blue-50 p-4"><Text className="text-sm leading-5 text-blue-900">Informal self-checks only. Not validated medical screening or a diagnosis.</Text></View>
                    <TouchableOpacity onPress={() => setPage('history')} className="mx-4 mt-4 flex-row items-center justify-center rounded-full border border-blue-200 bg-white py-4"><CalendarDays size={18} color="#2563eb" /><Text className="ml-2 font-bold text-blue-700">View test history</Text></TouchableOpacity>
                </> : null}

                {page === 'relax' && !relaxActivity ? <>
                    <RelaxCard title="Guided Breathing" desc="A gentle one-minute breathing pause" icon={<Wind size={28} color="#0891b2" />} tint="#0891b2" onPress={() => setRelaxActivity('breathing')} />
                    <RelaxCard title="Short Meditation" desc="A quiet three-minute reset" icon={<Flower2 size={28} color="#7c3aed" />} tint="#7c3aed" onPress={() => setRelaxActivity('meditation')} />
                    <RelaxCard title="Relaxing Sounds" desc="Take a mindful listening pause" icon={<Music2 size={28} color="#2563eb" />} tint="#2563eb" onPress={() => setRelaxActivity('sounds')} />
                    <RelaxCard title="Seated Stretching" desc="Three gentle stretches you can do seated" icon={<PersonStanding size={28} color="#16a34a" />} tint="#16a34a" onPress={() => setRelaxActivity('stretching')} />
                </> : null}

                {page === 'quizzes' && !quizQuestions.length ? <>
                    <View className="mx-4 mt-4 rounded-3xl border border-white bg-white p-4 shadow-sm"><Text className="text-lg font-bold text-slate-900">Pick a topic</Text><Text className="mt-1 text-sm text-slate-600">A fresh set of questions each time.</Text></View>
                    <View className="mx-4 mt-3 flex-row flex-wrap justify-between">{QUIZ_CATEGORIES.map((category, index) => <QuizTopicCard key={category} category={category} index={index} onPress={() => openQuiz(category)} />)}</View>
                    <View className="mx-4 mt-4 rounded-3xl bg-amber-50 p-5"><Text className="text-lg font-bold text-slate-900">Just for learning</Text><Text className="mt-2 leading-5 text-slate-600">No rankings. Go at your pace.</Text></View>
                </> : null}

                {page === 'history' ? <WellnessHistoryBoundary key={selectedHistory ? String(selectedHistory.result_id) : 'history-list'} onBack={() => setSelectedHistory(null)}><HistoryView results={tests} selected={selectedHistory} setSelected={setSelectedHistory} onRetake={(id) => { setSelectedHistory(null); setTestId(id); }} onLoadMore={loadOlderTests} hasMore={testsHaveMore} loadingMore={loadingOlderTests} /></WellnessHistoryBoundary> : null}
                {page === 'progress' ? <ProgressView completions={completions} streak={streak} onHistory={() => setPage('history')} /> : null}
            </ScrollView>
        </SafeAreaView>
    );
}

function pageForCategory(title: string): Page { return title === 'Brain Games' ? 'games' : title === 'Health Tests' ? 'tests' : title === 'Relax & Refresh' ? 'relax' : 'quizzes'; }
function pageTitle(page: Page) { return ({ home: 'Wellness Hub', games: 'Brain Games', tests: 'Health Tests', relax: 'Relax & Refresh', quizzes: 'Health Quizzes', history: 'Health-Test History', progress: 'Your Progress' })[page]; }
function pageSubtitle(page: Page) { return ({ home: 'Make your waiting time better', games: 'Puzzles, memory and logic', tests: 'Check in with your wellbeing', relax: 'Breathe, relax and feel better', quizzes: 'Learn about health in a fun way', history: 'Previous screening results', progress: 'Personal progress, at your own pace' })[page]; }

function CategoryCard({ title, onPress }: { title: keyof typeof CATEGORY_STYLE; onPress: () => void }) {
    const style = CATEGORY_STYLE[title]; const Icon = style.icon;
    const subtitle = title === 'Brain Games' ? 'Puzzles, memory and logic' : title === 'Health Tests' ? 'Eye, hearing and wellbeing' : title === 'Relax & Refresh' ? 'Breathing, meditation and more' : 'Learn useful health facts';
    return <Entrance style={{ width: '48.5%' }}><TouchableOpacity onPress={onPress} activeOpacity={0.76} className="min-h-[110px] w-full flex-row items-center rounded-3xl border border-white p-3 shadow-sm" style={{ backgroundColor: style.bg }}><View className="mr-2 h-12 w-12 items-center justify-center rounded-full bg-white/90"><Icon size={27} color={style.tint} /></View><View className="flex-1"><Text className="text-sm font-bold text-slate-900">{title}</Text><Text className="mt-1 text-xs leading-4 text-slate-600">{subtitle}</Text></View><ChevronRight size={16} color="#475569" /></TouchableOpacity></Entrance>;
}

function MindfulBreakIllustration() {
    return <View pointerEvents="none" style={{ position: 'absolute', right: -18, bottom: -36, width: 194, height: 194 }}>
        <Image source={require('../../assets/wellness/dapto_meditation_illustration.png')} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
    </View>;
}

function SectionTitle({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <View className="mx-4 mt-4 flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">{title}</Text><TouchableOpacity onPress={onPress}><Text className="font-semibold text-blue-600">{action}</Text></TouchableOpacity></View>; }
function ProgressMetric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <View className="flex-1 flex-row items-center justify-center">{icon}<View className="ml-2"><Text className="text-xl font-bold text-slate-900">{value}</Text><Text className="text-xs text-slate-600">{label}</Text></View></View>; }

function GameListCard({ game, index, onPress }: { game: WellnessGame; index: number; onPress: () => void }) {
    const GameIcon = game.kind === 'memory' ? Brain : game.kind === 'logic' ? Lightbulb : game.kind === 'sudoku' ? Grid3x3 : game.kind === 'word' ? Type : game.kind === 'pattern' ? Shapes : Zap;
    return <Entrance delay={Math.min(index, 5) * 35}><TouchableOpacity onPress={onPress} activeOpacity={0.76} className="mx-4 mt-3 flex-row items-center rounded-3xl border border-white p-4 shadow-sm" style={{ backgroundColor: gamePalette[index % gamePalette.length] }}><View className="mr-4 h-[68px] w-[68px] items-center justify-center rounded-[22px] bg-white/90"><GameIcon size={34} color={gamePalette[index % gamePalette.length] === '#fce7f3' ? '#db2777' : gamePalette[index % gamePalette.length] === '#dcfce7' ? '#059669' : '#2563eb'} /></View><View className="flex-1"><Text className="text-lg font-bold text-slate-900">{game.title}</Text><Text className="mt-1 text-sm text-slate-600">{game.description}</Text><View className="mt-2 flex-row items-center self-start rounded-full bg-white/90 px-3 py-1.5"><Clock3 size={18} color="#1e3a8a" strokeWidth={2.5} /><Text className="ml-1.5 text-sm font-semibold text-blue-950">{game.duration}</Text></View></View><ChevronRight size={21} color="#1e3a8a" /></TouchableOpacity></Entrance>;
}

function TestIcon({ testId, tint, bg }: { testId: string; tint: string; bg: string }) { const Icon = testId === 'VISION' || testId === 'COLOR_VISION' ? Eye : testId === 'HEARING' ? Ear : testId === 'SLEEP' ? Moon : testId === 'STRESS' ? Heart : Activity; return <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: bg }}><Icon size={25} color={tint} /></View>; }
function RelaxCard({ title, desc, icon, tint, onPress }: { title: string; desc: string; icon: React.ReactNode; tint: string; onPress: () => void }) { return <Entrance><TouchableOpacity onPress={onPress} activeOpacity={0.78} className="mx-4 mt-3 flex-row items-center rounded-3xl border border-white bg-white p-4 shadow-sm"><View className="mr-4 h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: `${tint}18` }}>{icon}</View><View className="flex-1"><Text className="font-bold text-slate-900">{title}</Text><Text className="mt-1 text-sm text-slate-600">{desc}</Text></View><ChevronRight size={20} color={tint} /></TouchableOpacity></Entrance>; }

function QuizTopicIcon({ category }: { category: string }) {
    const Icon = /nutrition/i.test(category) ? Apple : /first aid/i.test(category) ? ShieldPlus : /habit/i.test(category) ? Activity : /myth/i.test(category) ? Sparkles : HeartPulse;
    const color = /nutrition/i.test(category) ? '#e11d48' : /first aid/i.test(category) ? '#2563eb' : /habit/i.test(category) ? '#059669' : /myth/i.test(category) ? '#7c3aed' : /general health/i.test(category) ? '#0891b2' : '#d97706';
    return <Icon size={18} color={color} />;
}

function QuizTopicCard({ category, index, onPress }: { category: string; index: number; onPress: () => void }) {
    const tint = /nutrition/i.test(category) ? '#e11d48' : /first aid/i.test(category) ? '#2563eb' : /habit/i.test(category) ? '#059669' : /myth/i.test(category) ? '#7c3aed' : /general health/i.test(category) ? '#0891b2' : '#d97706';
    const background = /nutrition/i.test(category) ? '#fff0f5' : /first aid/i.test(category) ? '#edf5ff' : /habit/i.test(category) ? '#eafaf4' : /myth/i.test(category) ? '#f5f0ff' : /general health/i.test(category) ? '#eafaff' : '#fff6e7';
    const subtitle = category === 'All' ? 'Explore every topic' : category === 'Nutrition' ? 'Food and nutrition' : category === 'General Health' ? 'Everyday health' : category === 'First Aid' ? 'Simple first steps' : category === 'Healthy Habits' ? 'Small daily choices' : 'Facts and common claims';
    return <Entrance delay={Math.min(index, 5) * 35} style={{ width: '48.5%' }}><TouchableOpacity onPress={onPress} activeOpacity={0.78} className="mb-3 min-h-[112px] flex-row items-center rounded-3xl border border-white p-3 shadow-sm" style={{ backgroundColor: background }}><View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-white/90"><QuizTopicIcon category={category} /></View><View className="flex-1"><Text className="text-sm font-bold text-slate-900">{category}</Text><Text className="mt-1 text-xs leading-4 text-slate-600">{subtitle}</Text></View><ChevronRight size={17} color={tint} /></TouchableOpacity></Entrance>;
}

function QuizSession({ category, questions, onExposure, onBack, onFinish }: { category: string; questions: WellnessQuestion[]; onExposure: (id: string) => void; onBack: () => void; onFinish: () => void }) {
    const [index, setIndex] = useState(0); const [selected, setSelected] = useState<number | null>(null); const [finished, setFinished] = useState(false);
    const progress = useRef(new Animated.Value(1 / questions.length)).current;
    const loggedQuestionRef = React.useRef<string | null>(null);
    const finishRef = React.useRef(false);
    const question = questions[index];
    React.useEffect(() => { if (question && loggedQuestionRef.current !== question.id) { loggedQuestionRef.current = question.id; onExposure(question.id); } }, [question?.id]);
    const answer = (choice: number) => { if (selected !== null) return; setSelected(choice); };
    const next = () => { if (index + 1 < questions.length) { const nextIndex = index + 1; setIndex(nextIndex); setSelected(null); Animated.spring(progress, { toValue: (nextIndex + 1) / questions.length, damping: 20, stiffness: 150, useNativeDriver: false }).start(); } else if (!finishRef.current) { finishRef.current = true; setFinished(true); onFinish(); } };
    return <View className="flex-1 bg-slate-50">
        <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><TouchableOpacity onPress={onBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">Health Quizzes</Text></TouchableOpacity><Text className="text-2xl font-bold text-white">{finished ? 'Quiz completed' : category === 'All' ? question.category : category}</Text><Text className="mt-1 text-blue-100">{finished ? 'Nice work!' : `${index + 1} / ${questions.length}`}</Text></View>
        {finished ? <View className="m-4 flex-1 items-center justify-center rounded-3xl bg-white p-6"><Sparkles size={54} color="#f59e0b" /><Text className="mt-4 text-2xl font-bold text-slate-900">Well done!</Text><Text className="mt-2 text-center text-slate-600">You finished this quiz.</Text><TouchableOpacity onPress={onBack} className="mt-7 w-full rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Back to Quizzes</Text></TouchableOpacity></View> : <View className="m-4 flex-1 rounded-3xl bg-white p-5 shadow-sm"><View className="h-2.5 overflow-hidden rounded-full bg-blue-50"><Animated.View className="h-full rounded-full bg-blue-600" style={{ width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /></View><View className="mt-4 self-start rounded-full bg-violet-50 px-3 py-1.5"><Text className="text-xs font-bold text-violet-700">{question.category.toUpperCase()}</Text></View><Text className="mt-4 text-xl font-bold leading-7 text-slate-900">{question.prompt}</Text><View className="mt-5 gap-3">{question.options.map((option, choice) => { const isRight = choice === question.answer; const active = selected !== null && (isRight || selected === choice); return <TouchableOpacity key={option} onPress={() => answer(choice)} activeOpacity={0.76} className="flex-row items-center rounded-2xl border px-4 py-4" style={{ backgroundColor: active ? (isRight ? '#dcfce7' : '#fff1f2') : '#f8fafc', borderColor: active ? (isRight ? '#86efac' : '#fecdd3') : '#e2e8f0' }}><View className="mr-3 h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: active ? (isRight ? '#bbf7d0' : '#ffe4e6') : '#e0e7ff' }}>{selected !== null && active ? (isRight ? <CheckCircle2 size={18} color="#15803d" /> : <X size={18} color="#e11d48" />) : <Text className="text-xs font-bold text-indigo-700">{String.fromCharCode(65 + choice)}</Text>}</View><Text className="flex-1 font-semibold text-slate-800">{option}</Text></TouchableOpacity>; })}</View>{selected !== null ? <View className="mt-4 rounded-2xl bg-blue-50 p-4"><Text className="font-bold text-blue-900">{selected === question.answer ? 'Correct!' : 'Correct answer'}</Text><Text className="mt-1 leading-5 text-blue-900">{question.explanation}</Text><TouchableOpacity onPress={next} className="mt-4 rounded-full bg-blue-600 py-3"><Text className="text-center font-bold text-white">{index + 1 === questions.length ? 'Finish quiz' : 'Next question'}</Text></TouchableOpacity></View> : null}</View>}
    </View>;
}

function RelaxSession({ isScreenFocused, activityId, onBack, onComplete }: { isScreenFocused: boolean; activityId: string; onBack: () => void; onComplete: () => void }) {
    const [minutes, setMinutes] = useState(1);
    const [meditationMinutes, setMeditationMinutes] = useState(3);
    const [customTimer, setCustomTimer] = useState(false);
    const [customMinutesText, setCustomMinutesText] = useState('10');
    const [meditationStarted, setMeditationStarted] = useState(false);
    const [remaining, setRemaining] = useState(activityId === 'breathing' ? 60 : activityId === 'sounds' ? 300 : activityId === 'meditation' ? 180 : 0);
    const [stretchStep, setStretchStep] = useState(0);
    const stretchImageOpacities = useMemo(() => STRETCHES.map((_, index) => new Animated.Value(index === 0 ? 1 : 0)), []);
    const [playing, setPlaying] = useState(false);
    const [voice, setVoice] = useState(true);
    const [haptics, setHaptics] = useState(true);
    const [phase, setPhase] = useState<'in' | 'out'>('in');
    const [elapsed, setElapsed] = useState(0);
    const [soundChoice, setSoundChoice] = useState<SoundChoice>('rain');
    const soundTheme = SOUND_TRACKS.find((track) => track.id === soundChoice) ?? SOUND_TRACKS[4];
    const [soundMinutes, setSoundMinutes] = useState(5);
    const [soundStarted, setSoundStarted] = useState(false);
    const [customSoundTimer, setCustomSoundTimer] = useState(false);
    const [customSoundMinutesText, setCustomSoundMinutesText] = useState('10');
    const [soundLoaded, setSoundLoaded] = useState(false);
    const [soundError, setSoundError] = useState('');
    const [finished, setFinished] = useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);
    const completedRef = useRef(false);
    const startRef = useRef<number | null>(null);
    const accumulatedRef = useRef(0);
    const lastCueRef = useRef<string | null>(null);
    const scale = useRef(new Animated.Value(0.72)).current;
    const glow = useRef(new Animated.Value(0.3)).current;
    const meditationPulse = useRef(new Animated.Value(0.96)).current;
    const finish = () => {
        if (completedRef.current) return;
        completedRef.current = true;
        setPlaying(false);
        setFinished(true);
        void Speech.stop();
        Vibration.cancel();
        Vibration.vibrate([0, 120, 100, 300]);
        if (activityId === 'meditation') {
            void Speech.speak('Your meditation is complete. Take a moment before you continue.', { language: 'en-IN', rate: 0.82, pitch: 1 });
        }
        onComplete();
    };
    useEffect(() => {
        if (isScreenFocused) return;
        if (startRef.current !== null) accumulatedRef.current += Date.now() - startRef.current;
        startRef.current = null;
        setPlaying(false);
        void Speech.stop();
        if (soundRef.current) void soundRef.current.pauseAsync();
    }, [isScreenFocused]);
    useEffect(() => {
        if (activityId !== 'breathing' || !playing || remaining <= 0) return;
        const timer = setInterval(() => {
            if (startRef.current === null) return;
            const elapsedNow = accumulatedRef.current + Date.now() - startRef.current;
            const nextPhase = elapsedNow % 10000 < 4000 ? 'in' : 'out';
            setElapsed(elapsedNow);
            setRemaining(Math.max(0, minutes * 60 - Math.floor(elapsedNow / 1000)));
            setPhase((current) => { if (current !== nextPhase) lastCueRef.current = null; return nextPhase; });
        }, 100);
        return () => clearInterval(timer);
    }, [activityId, playing, minutes]);
    useEffect(() => {
        if (!playing || remaining <= 0 || activityId === 'stretching' || activityId === 'breathing') return;
        const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
        return () => clearInterval(timer);
    }, [playing, remaining, activityId]);
    useEffect(() => { if (playing && remaining === 0 && activityId !== 'stretching') finish(); }, [playing, remaining, activityId]);
    useEffect(() => {
        if (activityId !== 'meditation' || finished) return;
        const pulse = Animated.loop(Animated.sequence([
            Animated.timing(meditationPulse, { toValue: 1.04, duration: 2200, useNativeDriver: true }),
            Animated.timing(meditationPulse, { toValue: 0.96, duration: 2200, useNativeDriver: true }),
        ]));
        pulse.start();
        return () => pulse.stop();
    }, [activityId, finished, meditationPulse]);
    useEffect(() => {
        if (activityId !== 'breathing') return;
        scale.stopAnimation(); glow.stopAnimation();
        if (!playing) { Animated.parallel([Animated.spring(scale, { toValue: 0.72, damping: 18, stiffness: 110, useNativeDriver: true }), Animated.timing(glow, { toValue: 0.3, duration: 350, useNativeDriver: true })]).start(); return; }
        const inhale = phase === 'in';
        Animated.parallel([Animated.timing(scale, { toValue: inhale ? 1 : 0.72, duration: inhale ? 4000 : 6000, useNativeDriver: true }), Animated.timing(glow, { toValue: inhale ? 0.8 : 0.3, duration: inhale ? 4000 : 6000, useNativeDriver: true })]).start();
    }, [activityId, playing, phase, scale, glow]);
    useEffect(() => {
        if (activityId !== 'breathing' || !playing || remaining <= 0) return;
        const key = `${Math.floor(elapsed / 10000)}-${phase}`;
        if (lastCueRef.current === key) return;
        lastCueRef.current = key;
        if (haptics) Vibration.vibrate(18);
        if (voice) {
            if (Platform.OS === 'ios') {
                void (async () => {
                    try {
                        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
                        await Speech.stop();
                        await Speech.speak(phase === 'in' ? 'Breathe in' : 'Breathe out', { language: 'en-IN', rate: 0.82, pitch: 1 });
                    } catch { /* Keep the visual breathing guide usable if speech audio is unavailable. */ }
                })();
            } else {
                void Speech.stop();
                void Speech.speak(phase === 'in' ? 'Breathe in' : 'Breathe out', { language: 'en-IN', rate: 0.82, pitch: 1 });
            }
        }
    }, [activityId, playing, phase, elapsed, haptics, voice, remaining]);
    useEffect(() => {
        if (activityId !== 'sounds') return;
        const imageUri = Image.resolveAssetSource(soundTheme.image)?.uri;
        if (imageUri) void Image.prefetch(imageUri).catch(() => undefined);
    }, [activityId, soundTheme.image]);
    const backToSoundChoices = () => {
        setPlaying(false);
        setSoundStarted(false);
        setRemaining(soundMinutes * 60);
        setSoundError('');
        if (soundRef.current) void soundRef.current.stopAsync().catch(() => undefined);
    };
    useEffect(() => {
        if (activityId !== 'sounds' || !soundStarted) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            backToSoundChoices();
            return true;
        });
        return () => subscription.remove();
    }, [activityId, soundStarted, soundMinutes]);
    useEffect(() => {
        if (activityId !== 'sounds') return;
        let cancelled = false; let instance: Audio.Sound | null = null;
        setSoundLoaded(false); setSoundError('');
        const source = soundTheme.source;
        void (async () => { try { await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }); const loaded = await Audio.Sound.createAsync(source, { isLooping: true, shouldPlay: false, volume: 0.35, progressUpdateIntervalMillis: 500 }); instance = loaded.sound; if (cancelled) await instance.unloadAsync(); else { soundRef.current = instance; setSoundLoaded(true); } } catch { if (!cancelled) setSoundError('Could not load this sound on the device.'); } })();
        return () => { cancelled = true; soundRef.current = null; if (instance) void instance.unloadAsync(); };
    }, [activityId, soundTheme.source]);
    useEffect(() => {
        if (activityId !== 'stretching') return;
        const animation = Animated.parallel(stretchImageOpacities.map((opacity, index) => Animated.timing(opacity, { toValue: index === stretchStep ? 1 : 0, duration: 220, useNativeDriver: true })));
        animation.start();
        return () => animation.stop();
    }, [activityId, stretchStep, stretchImageOpacities]);
    useEffect(() => { const sound = soundRef.current; if (activityId !== 'sounds' || !sound || !soundLoaded || playing) return; void sound.pauseAsync().catch(() => setSoundError('Audio playback is unavailable.')); }, [activityId, playing, soundLoaded, soundChoice]);
    const title = activityId === 'breathing' ? 'Guided Breathing' : activityId === 'meditation' ? 'Short Meditation' : activityId === 'sounds' ? 'Relaxing Sounds' : 'Seated Stretching';
    const stretches = STRETCHES;
    const parsedCustomMinutes = Number(customMinutesText);
    const customTimerValid = /^\d+$/.test(customMinutesText) && parsedCustomMinutes >= 1 && parsedCustomMinutes <= 60;
    const parsedCustomSoundMinutes = Number(customSoundMinutesText);
    const customSoundTimerValid = /^\d+$/.test(customSoundMinutesText) && parsedCustomSoundMinutes >= 1 && parsedCustomSoundMinutes <= 60;
    const setCustomDuration = (value: number) => {
        const bounded = Math.max(1, Math.min(60, value));
        setCustomMinutesText(String(bounded));
        setMeditationMinutes(bounded);
        setRemaining(bounded * 60);
    };
    const setCustomSoundDuration = (value: number) => {
        const bounded = Math.max(1, Math.min(60, value));
        setCustomSoundMinutesText(String(bounded));
        setSoundMinutes(bounded);
        setRemaining(bounded * 60);
    };
    const toggleBreathing = () => {
        if (playing) { if (startRef.current !== null) accumulatedRef.current += Date.now() - startRef.current; startRef.current = null; setPlaying(false); void Speech.stop(); return; }
        if (activityId === 'breathing') { if (accumulatedRef.current === 0 && elapsed === 0) setRemaining(minutes * 60); startRef.current = Date.now(); lastCueRef.current = null; }
        setPlaying(true);
    };
    const toggleMeditation = () => {
        if (playing) { setPlaying(false); return; }
        if (customTimer && !customTimerValid) return;
        if (!meditationStarted) { setRemaining(meditationMinutes * 60); setMeditationStarted(true); }
        setPlaying(true);
    };
    const restartMeditation = () => {
        if (customTimer && !customTimerValid) return;
        void Speech.stop();
        completedRef.current = false;
        setFinished(false);
        setPlaying(false);
        setMeditationStarted(false);
        setRemaining(meditationMinutes * 60);
    };
    const toggleSound = async () => {
        if (playing) { setPlaying(false); return; }
        if (customSoundTimer && !customSoundTimerValid) return;
        const sound = soundRef.current;
        if (!sound || !soundLoaded) return;
        try {
            await sound.playAsync();
            if (!soundStarted) { setRemaining(soundMinutes * 60); setSoundStarted(true); }
            setSoundError('');
            setPlaying(true);
        } catch { setSoundError('Audio playback is unavailable.'); }
    };
    const restartSound = () => {
        if (customSoundTimer && !customSoundTimerValid) return;
        completedRef.current = false;
        setFinished(false);
        setPlaying(false);
        setSoundStarted(true);
        setRemaining(soundMinutes * 60);
        const sound = soundRef.current;
        if (sound) void sound.stopAsync().catch(() => setSoundError('Audio playback is unavailable.'));
    };
    if (finished && activityId === 'meditation') return <View className="flex-1 bg-slate-50"><View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><Text className="text-2xl font-bold text-white">Short Meditation</Text></View><View className="m-4 flex-1 items-center justify-center rounded-3xl bg-white p-6 shadow-sm"><Check size={58} color="#16a34a" /><Text className="mt-4 text-2xl font-bold text-slate-900">Session complete</Text><TouchableOpacity onPress={restartMeditation} className="mt-7 w-full rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Restart</Text></TouchableOpacity><TouchableOpacity onPress={onBack} className="mt-3 w-full rounded-full bg-violet-50 py-4"><Text className="text-center font-bold text-violet-800">Done</Text></TouchableOpacity></View></View>;
    if (finished && activityId === 'sounds') return <View className="flex-1" style={{ backgroundColor: soundTheme.background }}><View className="rounded-b-[28px] px-5 pb-5 pt-3" style={{ backgroundColor: soundTheme.header }}><Text className="text-2xl font-bold text-slate-800">Session complete</Text></View><View className="m-4 flex-1 items-center justify-center rounded-3xl bg-white p-6 shadow-sm"><Check size={58} color="#16a34a" /><Text className="mt-4 text-2xl font-bold text-slate-900">Quiet moment complete</Text><TouchableOpacity onPress={restartSound} className="mt-7 w-full rounded-full py-4" style={{ backgroundColor: soundTheme.soft }}><Text className="text-center font-bold" style={{ color: soundTheme.tint }}>Restart</Text></TouchableOpacity><TouchableOpacity onPress={onBack} className="mt-3 w-full rounded-full py-4" style={{ backgroundColor: soundTheme.soft }}><Text className="text-center font-bold" style={{ color: soundTheme.tint }}>Done</Text></TouchableOpacity></View></View>;
    if (finished) return <View className="flex-1 bg-slate-50"><View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3"><Text className="text-2xl font-bold text-white">Session complete</Text><Text className="mt-1 text-blue-100">A small moment for yourself</Text></View><View className="m-4 flex-1 items-center justify-center rounded-3xl bg-white p-6 shadow-sm"><Check size={60} color="#16a34a" /><Text className="mt-4 text-2xl font-bold text-slate-900">Well done</Text><Text className="mt-2 text-center text-slate-600">You completed {title}. Your progress is personal and private.</Text><TouchableOpacity onPress={onBack} className="mt-7 w-full rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Back to Relax & Refresh</Text></TouchableOpacity></View></View>;
    return <View className="flex-1 bg-slate-50" style={activityId === 'sounds' ? { backgroundColor: soundTheme.background } : undefined}><View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3" style={activityId === 'sounds' ? { backgroundColor: soundTheme.header } : undefined}><TouchableOpacity onPress={activityId === 'sounds' && soundStarted ? backToSoundChoices : onBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color={activityId === 'sounds' ? '#334155' : 'white'} /><Text className="ml-2" style={{ color: activityId === 'sounds' ? '#334155' : 'white' }}>Relax & Refresh</Text></TouchableOpacity><Text className="text-2xl font-bold" style={{ color: activityId === 'sounds' ? '#1e293b' : 'white' }}>{title}</Text><Text className="mt-1" style={{ color: activityId === 'sounds' ? '#475569' : '#dbeafe' }}>{activityId === 'sounds' ? 'Choose a sound and unwind' : activityId === 'breathing' ? 'Follow the rhythm at your own pace' : activityId === 'meditation' ? 'A quiet moment, just for you' : activityId === 'stretching' ? 'Gentle movement, at your own pace' : 'Gentle and optional · Stop if uncomfortable'}</Text></View><View className="m-4 flex-1 items-center justify-center rounded-3xl bg-white p-6 shadow-sm">
        {activityId === 'stretching' ? <View className="w-full flex-1 justify-center">
            <View className="mb-4 w-full flex-row items-center justify-center">
                {stretches.map((_, index) => <React.Fragment key={index}><View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: index === stretchStep ? '#2563eb' : index < stretchStep ? '#dbeafe' : '#e2e8f0' }}><Text className="text-sm font-bold" style={{ color: index === stretchStep ? 'white' : '#64748b' }}>{index + 1}</Text></View>{index < stretches.length - 1 ? <View className="mx-2 h-1 flex-1 rounded-full" style={{ backgroundColor: index < stretchStep ? '#93c5fd' : '#dbeafe' }} /> : null}</React.Fragment>)}
            </View>
            <View className="h-[250px] w-full overflow-hidden rounded-3xl bg-white">{stretches.map((stretch, index) => <Animated.Image key={stretch.title} source={stretch.image} resizeMode="contain" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: 250, opacity: stretchImageOpacities[index] }} />)}</View>
            <Text className="mt-3 text-center text-2xl font-bold text-slate-900">{stretches[stretchStep].title}</Text>
            <View className="mt-2 h-[76px] w-full justify-center"><Text className="text-center text-base leading-6 text-slate-600">{stretches[stretchStep].description}</Text></View>
            <View className="mt-4 h-[56px] w-full flex-row items-center rounded-2xl bg-blue-50 px-4"><Info size={20} color="#2563eb" /><Text numberOfLines={2} className="ml-2 flex-1 text-sm font-medium leading-5 text-blue-700">{stretches[stretchStep].tip}</Text></View>
            <TouchableOpacity onPress={() => { if (stretchStep < stretches.length - 1) setStretchStep((step) => step + 1); else finish(); }} className="mt-4 w-full rounded-full bg-blue-600 py-4"><Text className="text-center text-base font-bold text-white">{stretchStep < stretches.length - 1 ? 'Next stretch  →' : 'Finish session  ✓'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { if (stretchStep < stretches.length - 1) setStretchStep((step) => step + 1); else finish(); }} className="mt-2 items-center py-2"><Text className="font-semibold text-blue-600">Skip this stretch</Text></TouchableOpacity>
        </View> : null}
        {activityId === 'sounds' ? <>
            {!soundStarted ? <><View className="mb-3 w-full flex-row flex-wrap justify-between gap-y-2">{SOUND_TRACKS.map((track) => { const TrackIcon = track.icon; const selected = soundChoice === track.id; return <TouchableOpacity key={track.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setPlaying(false); setSoundChoice(track.id); setRemaining(soundMinutes * 60); setSoundError(''); }} className="items-center justify-center rounded-2xl border" style={{ width: '31.8%', height: 76, backgroundColor: track.soft, borderColor: selected ? track.tint : '#e2e8f0', borderWidth: selected ? 2 : 1 }}><TrackIcon size={22} color={track.tint} /><Text numberOfLines={1} className="mt-1 px-1 text-center text-xs font-bold text-slate-900">{track.label}</Text></TouchableOpacity>; })}</View><View className="mb-3 flex-row items-center justify-center gap-1 rounded-full bg-slate-50 p-1">{[5, 10, 15].map((value) => <TouchableOpacity key={value} onPress={() => { setCustomSoundTimer(false); setSoundMinutes(value); setRemaining(value * 60); }} className="rounded-full px-3.5 py-2.5" style={{ backgroundColor: !customSoundTimer && soundMinutes === value ? soundTheme.soft : 'transparent' }}><Text className="font-bold" style={{ color: !customSoundTimer && soundMinutes === value ? soundTheme.tint : '#475569' }}>{value} min</Text></TouchableOpacity>)}<TouchableOpacity onPress={() => { setCustomSoundTimer(true); setCustomSoundDuration(10); }} className="rounded-full px-3.5 py-2.5" style={{ backgroundColor: customSoundTimer ? soundTheme.soft : 'transparent' }}><Text className="font-bold" style={{ color: customSoundTimer ? soundTheme.tint : '#475569' }}>Custom</Text></TouchableOpacity></View>
            {customSoundTimer ? <View className="mb-3 w-full rounded-2xl border px-4 py-3" style={{ backgroundColor: soundTheme.soft, borderColor: soundTheme.tint }}><View className="flex-row items-center justify-between"><Text className="text-sm font-semibold text-slate-800">Session length</Text><Text className="text-xs font-medium text-slate-500">1–60 min</Text></View><View className="mt-2 flex-row items-center justify-center gap-4"><TouchableOpacity accessibilityLabel="Decrease sound timer by one minute" disabled={customSoundTimerValid && parsedCustomSoundMinutes <= 1} onPress={() => setCustomSoundDuration((customSoundTimerValid ? parsedCustomSoundMinutes : 10) - 1)} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Minus size={19} color={soundTheme.tint} /></TouchableOpacity><TextInput accessibilityLabel="Custom sound session minutes" value={customSoundMinutesText} onChangeText={(value) => { const clean = value.replace(/[^0-9]/g, '').slice(0, 2); setCustomSoundMinutesText(clean); const parsed = Number(clean); if (parsed >= 1 && parsed <= 60) { setSoundMinutes(parsed); setRemaining(parsed * 60); } }} onBlur={() => { if (!customSoundTimerValid) setCustomSoundDuration(10); }} keyboardType="number-pad" maxLength={2} className="min-w-[72px] rounded-xl bg-white px-3 py-1 text-center text-2xl font-bold text-slate-900" /><TouchableOpacity accessibilityLabel="Increase sound timer by one minute" disabled={customSoundTimerValid && parsedCustomSoundMinutes >= 60} onPress={() => setCustomSoundDuration((customSoundTimerValid ? parsedCustomSoundMinutes : 10) + 1)} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Plus size={19} color={soundTheme.tint} /></TouchableOpacity></View></View> : null}</> : null}
            {soundStarted ? <Image source={soundTheme.image} resizeMode="contain" fadeDuration={300} style={{ width: '100%', height: 300, marginBottom: 4 }} /> : null}
            <View className="my-3 flex-row items-center rounded-full px-5 py-3" style={{ backgroundColor: soundTheme.soft }}><Clock3 size={26} color={soundTheme.tint} strokeWidth={2.5} /><Text className="ml-3 text-4xl font-bold tabular-nums" style={{ color: soundTheme.tint }}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text></View>
            {soundError ? <Text className="mb-2 text-sm text-rose-600">{soundError}</Text> : null}
            <View className="w-full flex-row gap-3"><TouchableOpacity disabled={!soundLoaded || (customSoundTimer && !customSoundTimerValid)} onPress={toggleSound} className="flex-1 rounded-full py-4" style={{ backgroundColor: soundTheme.soft, opacity: soundLoaded && (!customSoundTimer || customSoundTimerValid) ? 1 : 0.55 }}><Text className="text-center font-bold" style={{ color: soundTheme.tint }}>{!soundLoaded ? 'Loading sound…' : playing ? 'Pause' : soundStarted ? 'Resume' : 'Play'}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Restart sound session" disabled={customSoundTimer && !customSoundTimerValid} onPress={restartSound} className="w-14 items-center justify-center rounded-full" style={{ backgroundColor: soundTheme.soft }}><RotateCcw size={22} color={soundTheme.tint} /></TouchableOpacity></View>
        </> : null}
        {activityId === 'breathing' ? <><View className="mb-4 flex-row items-center justify-center gap-2 rounded-full bg-slate-50 p-1.5">{[1, 3, 5].map((value) => <TouchableOpacity key={value} disabled={playing || elapsed > 0} onPress={() => { setMinutes(value); setRemaining(value * 60); }} className="rounded-full px-5 py-2.5" style={{ backgroundColor: minutes === value ? '#2563eb' : 'transparent' }}><Text className="font-bold" style={{ color: minutes === value ? 'white' : '#475569' }}>{value} min</Text></TouchableOpacity>)}</View><View className="mb-2 flex-row items-center rounded-full bg-blue-50 px-4 py-2"><Clock3 size={20} color="#1d4ed8" /><Text className="ml-2 text-2xl font-bold tabular-nums text-blue-800">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text></View>
            <View className="h-64 w-64 items-center justify-center"><Animated.View style={{ position: 'absolute', width: 230, height: 230, borderRadius: 120, backgroundColor: phase === 'in' && playing ? '#bae6fd' : '#ddd6fe', opacity: glow, transform: [{ scale }] }} /><Animated.View style={{ width: 190, height: 190, borderRadius: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', borderWidth: 10, borderColor: phase === 'in' && playing ? '#7dd3fc' : '#c4b5fd', transform: [{ scale }] }}><Wind size={42} color="#2563eb" /><Text className="mt-3 text-xl font-bold text-blue-900">{playing ? (phase === 'in' ? 'Breathe in' : 'Breathe out') : 'Ready?'}</Text>{playing ? <Text className="mt-1 text-sm font-medium text-slate-500">{phase === 'in' ? `${Math.max(1, Math.ceil(4 - (elapsed % 10000) / 1000))} sec` : `${Math.max(1, Math.ceil(10 - (elapsed % 10000) / 1000))} sec`}</Text> : null}</Animated.View></View>
            <View className="mt-3 w-full flex-row justify-center gap-3"><TouchableOpacity accessibilityRole="button" accessibilityLabel={voice ? 'Turn voice guidance off' : 'Turn voice guidance on'} onPress={() => { setVoice((value) => !value); void Speech.stop(); }} className="flex-row items-center rounded-full bg-violet-50 px-4 py-3">{voice ? <Volume2 size={19} color="#7c3aed" /> : <VolumeX size={19} color="#7c3aed" />}<Text className="ml-2 font-semibold text-violet-800">Voice {voice ? 'on' : 'off'}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={haptics ? 'Turn vibration off' : 'Turn vibration on'} onPress={() => setHaptics((value) => !value)} className="flex-row items-center rounded-full bg-emerald-50 px-4 py-3"><Activity size={19} color="#059669" /><Text className="ml-2 font-semibold text-emerald-800">Vibration {haptics ? 'on' : 'off'}</Text></TouchableOpacity></View><TouchableOpacity onPress={toggleBreathing} className="mt-5 w-full rounded-full bg-blue-600 py-4"><Text className="text-center text-base font-bold text-white">{playing ? 'Pause' : elapsed > 0 ? 'Resume' : 'Begin'}</Text></TouchableOpacity><Text className="mt-3 text-center text-xs text-slate-500">Follow the circle. Keep each breath comfortable.</Text></> : null}
        {activityId === 'meditation' ? <>
            {!meditationStarted ? <><View className="mb-4 flex-row items-center justify-center gap-1 rounded-full bg-slate-50 p-1.5">{[1, 3, 5].map((value) => <TouchableOpacity key={value} onPress={() => { setCustomTimer(false); setMeditationMinutes(value); setRemaining(value * 60); }} className="rounded-full px-4 py-2.5" style={{ backgroundColor: !customTimer && meditationMinutes === value ? '#7c3aed' : 'transparent' }}><Text className="font-bold" style={{ color: !customTimer && meditationMinutes === value ? 'white' : '#475569' }}>{value} min</Text></TouchableOpacity>)}<TouchableOpacity onPress={() => { setCustomTimer(true); setCustomDuration(10); }} className="rounded-full px-4 py-2.5" style={{ backgroundColor: customTimer ? '#7c3aed' : 'transparent' }}><Text className="font-bold" style={{ color: customTimer ? 'white' : '#475569' }}>Custom</Text></TouchableOpacity></View>
            {customTimer ? <View className="mb-4 w-full rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3"><View className="flex-row items-center justify-between"><Text className="text-sm font-semibold text-violet-900">Session length</Text><Text className="text-xs font-medium text-violet-500">1–60 min</Text></View><View className="mt-2 flex-row items-center justify-center gap-4"><TouchableOpacity accessibilityLabel="Decrease timer by one minute" disabled={customTimerValid && parsedCustomMinutes <= 1} onPress={() => setCustomDuration((customTimerValid ? parsedCustomMinutes : 10) - 1)} className="h-11 w-11 items-center justify-center rounded-full bg-white" style={{ opacity: customTimerValid && parsedCustomMinutes <= 1 ? 0.45 : 1 }}><Minus size={20} color="#7c3aed" /></TouchableOpacity><TextInput accessibilityLabel="Custom meditation minutes" value={customMinutesText} onChangeText={(value) => { setCustomMinutesText(value.replace(/[^0-9]/g, '').slice(0, 2)); const parsed = Number(value.replace(/[^0-9]/g, '').slice(0, 2)); if (parsed >= 1 && parsed <= 60) { setMeditationMinutes(parsed); setRemaining(parsed * 60); } }} onBlur={() => { if (!customTimerValid) setCustomDuration(10); }} keyboardType="number-pad" maxLength={2} className="min-w-[76px] rounded-xl bg-white px-3 py-1 text-center text-3xl font-bold text-violet-900" /><TouchableOpacity accessibilityLabel="Increase timer by one minute" disabled={customTimerValid && parsedCustomMinutes >= 60} onPress={() => setCustomDuration((customTimerValid ? parsedCustomMinutes : 10) + 1)} className="h-11 w-11 items-center justify-center rounded-full bg-white" style={{ opacity: customTimerValid && parsedCustomMinutes >= 60 ? 0.45 : 1 }}><Plus size={20} color="#7c3aed" /></TouchableOpacity></View></View> : null}</> : null}
            <View className="mb-3 flex-row items-center rounded-full bg-violet-50 px-4 py-2"><Clock3 size={22} color="#7c3aed" /><Text className="ml-2 text-3xl font-bold tabular-nums text-violet-900">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text></View>
            <View className="h-60 w-60 items-center justify-center"><Animated.View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 120, backgroundColor: '#ede9fe', opacity: 0.75, transform: [{ scale: meditationPulse }] }} /><View className="h-48 w-48 items-center justify-center rounded-full border-[10px] border-violet-200 bg-violet-50"><Flower2 size={64} color="#7c3aed" strokeWidth={1.8} /></View></View>
            <View className="mt-6 w-full flex-row gap-3"><TouchableOpacity disabled={customTimer && !customTimerValid} onPress={toggleMeditation} className="flex-1 rounded-full bg-violet-600 py-4" style={{ opacity: customTimer && !customTimerValid ? 0.5 : 1 }}><Text className="text-center font-bold text-white">{playing ? 'Pause' : meditationStarted ? 'Resume' : 'Begin'}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Restart meditation" disabled={customTimer && !customTimerValid} onPress={restartMeditation} className="w-14 items-center justify-center rounded-full bg-violet-50" style={{ opacity: customTimer && !customTimerValid ? 0.5 : 1 }}><RotateCcw size={22} color="#6d28d9" /></TouchableOpacity></View>
        </> : null}
    </View></View>;
}
class WellnessHistoryBoundary extends React.Component<{ children: React.ReactNode; onBack: () => void }, { hasError: boolean }> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[Wellness history detail render error]', error, info.componentStack);
    }
    render() {
        if (this.state.hasError) return <View className="mx-4 mt-4 rounded-3xl bg-rose-50 p-5"><Text className="font-bold text-rose-900">Could not open this result</Text><Text className="mt-2 text-sm text-rose-800">Return to your test history and try again.</Text><TouchableOpacity onPress={this.props.onBack} className="mt-4 rounded-full bg-blue-600 py-3"><Text className="text-center font-bold text-white">Back to history</Text></TouchableOpacity></View>;
        return this.props.children;
    }
}

function HistoryView({ results, selected, setSelected, onRetake, onLoadMore, hasMore, loadingMore }: { results: WellnessTestResult[]; selected: WellnessTestResult | null; setSelected: (item: WellnessTestResult | null) => void; onRetake: (id: string) => void; onLoadMore: () => Promise<WellnessTestResult[]>; hasMore: boolean; loadingMore: boolean }) {
    const [focusedResult, setFocusedResult] = React.useState<WellnessTestResult | null>(selected);
    const [chartStartId, setChartStartId] = React.useState<string | null>(null);
    if (selected) {
        const activeResult = focusedResult && focusedResult.test_type === selected.test_type && visionEyeLabel(focusedResult) === visionEyeLabel(selected) ? focusedResult : selected;
        const comparable = comparableSeries(results, activeResult);
        const defaultStart = Math.max(0, comparable.length - 8);
        const savedStart = chartStartId ? comparable.findIndex((item) => String(item.result_id) === chartStartId) : -1;
        const chartStart = savedStart >= 0 ? savedStart : defaultStart;
        const chartResults = comparable.slice(chartStart, chartStart + 8);
        const eyeLabel = visionEyeLabel(activeResult);
        const showOlderWindow = async () => {
            if (chartStart > 0) {
                const nextStart = Math.max(0, chartStart - 8);
                setChartStartId(String(comparable[nextStart].result_id));
                setFocusedResult(comparable[nextStart]);
                return;
            }
            if (!hasMore || loadingMore) return;
            const previousStartId = chartResults[0] ? String(chartResults[0].result_id) : null;
            const added = await onLoadMore();
            if (!previousStartId || !added.length) return;
            const extended = comparableSeries([...results, ...added], activeResult);
            const oldStart = extended.findIndex((item) => String(item.result_id) === previousStartId);
            if (oldStart > 0) {
                const nextStart = Math.max(0, oldStart - 8);
                setChartStartId(String(extended[nextStart].result_id));
                setFocusedResult(extended[nextStart]);
            }
        };
        const showNewerWindow = () => {
            const nextStart = Math.min(Math.max(0, comparable.length - 8), chartStart + 8);
            if (nextStart === chartStart) return;
            setChartStartId(String(comparable[nextStart].result_id));
            setFocusedResult(comparable[nextStart]);
        };
        return <View className="mx-4 mt-4 rounded-3xl bg-white p-5 shadow-sm">
            <TouchableOpacity onPress={() => { setFocusedResult(null); setSelected(null); }} className="mb-4 flex-row items-center"><ArrowLeft size={18} color="#2563eb" /><Text className="ml-2 font-semibold text-blue-700">All tests</Text></TouchableOpacity>
            <Text className="text-xl font-bold text-slate-900">{testName(activeResult.test_type)}{eyeLabel ? ` · ${eyeLabel}` : ''}</Text>
            <Text className="mb-2 mt-5 font-bold text-slate-900">Trend · tap a point</Text>
            {comparable.length > 1 ? <View className="rounded-2xl bg-slate-50 px-2 py-3"><HistoryLineChart results={chartResults} selectedResultId={String(activeResult.result_id)} onSelect={(item) => setFocusedResult(item)} /><View className="mt-1 flex-row items-center justify-between px-1"><Text className="text-xs text-slate-500">{new Date(chartResults[0].completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text><View className="flex-row items-center gap-2"><TouchableOpacity disabled={chartStart === 0 && (!hasMore || loadingMore)} onPress={() => { void showOlderWindow(); }} className="rounded-full bg-white px-3 py-2" style={{ opacity: chartStart === 0 && (!hasMore || loadingMore) ? 0.45 : 1 }}><Text className="text-xs font-semibold text-blue-700">{chartStart === 0 && loadingMore ? 'Loading…' : 'Older'}</Text></TouchableOpacity><TouchableOpacity disabled={chartStart + 8 >= comparable.length} onPress={showNewerWindow} className="rounded-full bg-white px-3 py-2" style={{ opacity: chartStart + 8 >= comparable.length ? 0.45 : 1 }}><Text className="text-xs font-semibold text-blue-700">Newer</Text></TouchableOpacity></View><Text className="text-xs text-slate-500">{new Date(chartResults[chartResults.length - 1].completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View></View> : <View className="items-center rounded-2xl bg-slate-50 py-8"><Activity size={28} color="#64748b" /><Text className="mt-2 text-sm text-slate-600">{hasMore ? 'More history may be available.' : 'Take this test again to see a trend.'}</Text>{hasMore ? <TouchableOpacity disabled={loadingMore} onPress={() => { void onLoadMore(); }} className="mt-3 rounded-full bg-white px-4 py-2.5"><Text className="font-semibold text-blue-700">{loadingMore ? 'Loading…' : 'Load older'}</Text></TouchableOpacity> : null}</View>}
            <View className="mt-2 rounded-2xl bg-blue-50 px-4 py-3"><Text className="text-lg font-bold text-blue-800">{formatResultValue(activeResult.result_value)}{activeResult.result_unit ? ` ${activeResult.result_unit}` : ''}</Text><Text className="mt-1 text-sm text-slate-600">{formatResultDateTime(activeResult.completed_at)}</Text></View>
            {activeResult.test_type === 'HEARING' ? <HearingHistoryDetails result={activeResult} /> : null}
            {activeResult.test_type === 'COLOR_VISION' ? <ColorVisionHistoryDetails result={activeResult} /> : null}
            <Text className="mt-3 text-xs text-slate-500">Results are informational, not a diagnosis.</Text>
            <TouchableOpacity onPress={() => onRetake(selected.test_type)} className="mt-5 rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Retake test</Text></TouchableOpacity>
        </View>;
    }
    const groups = [...new Set(results.map((item) => item.test_type))].map((testType) => ({
        testType,
        items: results.filter((item) => item.test_type === testType).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at)),
    })).sort((a, b) => Date.parse(b.items[0]?.completed_at || '') - Date.parse(a.items[0]?.completed_at || ''));
    return <View className="mx-4 mt-4">
        {groups.length === 0 ? <View className="rounded-3xl bg-white p-5"><Text className="font-semibold text-slate-900">No test results yet</Text><Text className="mt-2 text-sm text-slate-600">Completed tests will appear here.</Text></View> : groups.map(({ testType, items }) => {
            if (testType === 'VISION') {
                const latestForEye = (eye: 'Left eye' | 'Right eye') => items.find((item) => visionEyeLabel(item) === eye);
                return <View key={testType} className="mb-3 rounded-3xl bg-white p-4 shadow-sm"><View className="mb-2 flex-row items-center"><TestIcon testId={testType} tint="#db2777" bg="#fff0f7" /><View className="ml-3"><Text className="text-lg font-bold text-slate-900">{testName(testType)}</Text><Text className="text-xs text-slate-500">Each eye tracked separately</Text></View></View>
                    {(['Left eye', 'Right eye'] as const).map((eye) => { const latest = latestForEye(eye); if (!latest) return null; const series = comparableResults(items, latest); return <TouchableOpacity key={eye} accessibilityRole="button" onPress={() => { setFocusedResult(latest); setSelected(latest); }} className="mt-3 rounded-2xl bg-slate-50 p-3"><View className="flex-row items-center justify-between"><Text className="font-semibold text-slate-800">{eye}</Text><Text className="font-bold text-blue-700">{latest.result_value ?? '—'}{latest.result_unit ? ` ${latest.result_unit}` : ''}</Text></View><HistoryLineChart results={series} compact /><Text className="mt-1 text-right text-[10px] text-slate-400">{new Date(latest.completed_at).toLocaleDateString()}</Text></TouchableOpacity>; })}
                </View>;
            }
            const latest = items[0]; const series = comparableResults(items, latest);
            return <TouchableOpacity key={testType} accessibilityRole="button" onPress={() => { setFocusedResult(latest); setSelected(latest); }} className="mb-3 rounded-3xl bg-white p-4 shadow-sm"><View className="flex-row items-center"><TestIcon testId={testType} tint="#db2777" bg="#fff0f7" /><View className="ml-3 flex-1"><Text className="text-lg font-bold text-slate-900">{testName(testType)}</Text><Text className="mt-1 text-xs text-slate-500">{new Date(latest.completed_at).toLocaleDateString()}</Text></View><ChevronRight size={20} color="#64748b" /></View><View className="mt-3 flex-row items-end justify-between"><Text className="text-sm text-slate-500">Latest</Text><Text className="font-bold text-blue-700">{latest.result_value != null ? `${latest.result_value}${latest.result_unit ? ` ${latest.result_unit}` : ''}` : 'Completed'}</Text></View><HistoryLineChart results={series} compact /></TouchableOpacity>;
        })}
        {hasMore ? <TouchableOpacity disabled={loadingMore} onPress={onLoadMore} className="mb-5 rounded-full border border-blue-200 bg-white py-3"><Text className="text-center font-semibold text-blue-700">{loadingMore ? 'Loading…' : 'Load older results'}</Text></TouchableOpacity> : null}
    </View>;
}
function HearingHistoryDetails({ result }: { result: WellnessTestResult }) {
    const rows = Array.isArray(result.result_details?.frequencies) ? result.result_details.frequencies as Array<{ hz: number; left?: { heard: boolean }; right?: { heard: boolean } }> : [];
    if (!rows.length) return null;
    return <View className="mt-4 rounded-2xl bg-slate-50 p-4"><Text className="mb-2 font-bold text-slate-900">Reported tones by ear</Text><View className="mb-1 flex-row"><Text className="flex-1 text-xs font-semibold text-slate-500">FREQUENCY</Text><Text className="w-20 text-center text-xs font-semibold text-slate-500">LEFT</Text><Text className="w-20 text-center text-xs font-semibold text-slate-500">RIGHT</Text></View>{rows.map((row) => <View key={row.hz} className="flex-row items-center border-t border-slate-200 py-2"><Text className="flex-1 text-sm text-slate-700">{row.hz} Hz</Text><Text className="w-20 text-center text-sm font-semibold text-slate-800">{row.left?.heard ? 'Heard' : 'Not heard'}</Text><Text className="w-20 text-center text-sm font-semibold text-slate-800">{row.right?.heard ? 'Heard' : 'Not heard'}</Text></View>)}</View>;
}
function ColorVisionHistoryDetails({ result }: { result: WellnessTestResult }) {
    const raw = result.result_details?.responses;
    const rows = Array.isArray(raw) ? raw as Array<{ plate_id?: unknown; level?: unknown; selected_value?: unknown; correct_value?: unknown; correct?: unknown }> : [];
    if (!rows.length) return null;
    return <View className="mt-4 rounded-2xl bg-violet-50 p-4">
        <Text className="mb-2 font-bold text-slate-900">Plate answers</Text>
        {rows.map((row, index) => {
            const plate = typeof row.plate_id === 'string' ? COLOR_VISION_PLATE_BY_ID.get(row.plate_id) : undefined;
            return <View key={`${String(row.plate_id)}-${index}`} className="mb-2 flex-row items-center rounded-2xl bg-white p-2.5">
                {plate ? <Image source={plate.image} resizeMode="contain" style={{ width: 48, height: 48 }} /> : <View className="h-12 w-12 rounded-xl bg-violet-100" />}
                <View className="ml-3 flex-1"><Text className="text-sm font-semibold text-slate-800">Level {typeof row.level === 'number' ? row.level : '—'}</Text><Text className="mt-0.5 text-xs text-slate-600">You chose {String(row.selected_value ?? '—')} · Answer {String(row.correct_value ?? '—')}</Text></View>
                <Text className={`text-xs font-bold ${row.correct === true ? 'text-emerald-700' : 'text-rose-700'}`}>{row.correct === true ? 'Correct' : 'Missed'}</Text>
            </View>;
        })}
    </View>;
}
function comparableResults(results: WellnessTestResult[], anchor: WellnessTestResult) {
    const series = comparableSeries(results, anchor);
    const selectedIndex = series.findIndex((item) => String(item.result_id) === String(anchor.result_id));
    if (series.length <= 8) return series;
    const start = Math.max(0, Math.min(series.length - 8, selectedIndex - 3));
    return series.slice(start, start + 8);
}
function comparableSeries(results: WellnessTestResult[], anchor: WellnessTestResult) {
    return results.filter((item) => item.test_type === anchor.test_type && item.method_version === anchor.method_version && item.result_unit === anchor.result_unit && item.result_value != null).sort((a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at));
}
function HistoryLineChart({ results, compact = false, selectedResultId, onSelect }: { results: WellnessTestResult[]; compact?: boolean; selectedResultId?: string; onSelect?: (result: WellnessTestResult) => void }) {
    const values = results.map((item) => Number(item.result_value));
    const rawMin = Math.min(...values); const rawMax = Math.max(...values);
    const padding = rawMin === rawMax ? Math.max(Math.abs(rawMax) * 0.1, 1) : (rawMax - rawMin) * 0.15;
    const fixedFrequencyScale = (results[0]?.test_type === 'SLEEP' && results[0]?.method_version === 'sleep-frequency-checkin-v2') || (results[0]?.test_type === 'STRESS' && results[0]?.method_version === 'stress-frequency-checkin-v2') || (results[0]?.test_type === 'GENERAL' && results[0]?.method_version === 'general-frequency-checkin-v2');
    const minValue = fixedFrequencyScale ? 0 : rawMin - padding; const maxValue = fixedFrequencyScale ? 15 : rawMax + padding;
    const width = 340; const height = compact ? 74 : 156; const left = compact ? 16 : 52; const right = 324; const top = 14; const bottom = compact ? 62 : 128;
    const points = values.map((value, index) => ({ x: values.length === 1 ? (left + right) / 2 : left + ((right - left) * index) / (values.length - 1), y: bottom - ((value - minValue) / (maxValue - minValue)) * (bottom - top) }));
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    return <Svg width="100%" height={height} viewBox={`0 0 ${width} ${compact ? 74 : 156}`}>
        {!compact ? <>{[0, 0.5, 1].map((fraction) => <Line key={fraction} x1={left} x2={right} y1={top + (bottom - top) * fraction} y2={top + (bottom - top) * fraction} stroke="#dbeafe" strokeWidth="1" />)}<SvgText x="2" y={top + 4} fill="#64748b" fontSize="10">{formatResultValue(fixedFrequencyScale ? 15 : rawMax)}</SvgText><SvgText x="2" y={bottom + 4} fill="#64748b" fontSize="10">{formatResultValue(fixedFrequencyScale ? 0 : rawMin)}</SvgText></> : null}
        {points.length > 1 ? <Path d={path} fill="none" stroke="#2563eb" strokeWidth={compact ? 3 : 3.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((point, index) => { const result = results[index]; const isSelected = String(result.result_id) === selectedResultId; return <Circle key={String(result.result_id)} cx={point.x} cy={point.y} r={isSelected ? 12 : compact ? 4 : 9} fill={isSelected ? '#2563eb' : '#ffffff'} stroke="#2563eb" strokeWidth="3" onPress={onSelect ? () => onSelect(result) : undefined} accessibilityLabel={onSelect ? `${formatResultValue(result.result_value)} ${result.result_unit || ''}, ${formatResultDateTime(result.completed_at)}` : undefined} />; })}
    </Svg>;
}
function formatResultValue(value: number | string | null) {
    if (value == null) return 'Completed';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : String(value);
}
function formatResultDateTime(value: string) {
    const date = new Date(value);
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
function visionEyeLabel(result: WellnessTestResult) {
    if (result.test_type !== 'VISION') return '';
    if (result.method_version?.endsWith('-left')) return 'Left eye';
    if (result.method_version?.endsWith('-right')) return 'Right eye';
    return '';
}
function testName(id: string) { return WELLNESS_TESTS.find((item) => item.id === id)?.title || id; }

function ProgressView({ completions, streak, onHistory }: { completions: WellnessCompletion[]; streak: { current: number; days: string[] }; onHistory: () => void }) {
    const [month, setMonth] = React.useState(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const activeDays = new Set(streak.days);
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: cellCount }, (_, index) => {
        const day = index - firstWeekday + 1;
        return day > 0 && day <= daysInMonth ? day : null;
    });
    const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const currentMonth = new Date().getFullYear() === month.getFullYear() && new Date().getMonth() === month.getMonth();

    return <View className="mx-4 mt-4">
        <View className="flex-row rounded-3xl bg-white p-5 shadow-sm">
            <ProgressMetric icon={<Flame size={28} color="#f97316" />} value={String(streak.current)} label="Day streak" />
            <View className="mx-2 w-px bg-slate-200" />
            <ProgressMetric icon={<Sparkles size={27} color="#f59e0b" />} value={`${completions.length}${completions.length >= 100 ? '+' : ''}`} label="Activities" />
        </View>
        <View className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
            <Text className="text-lg font-bold text-slate-900">Active days</Text>
            <View className="mt-3 flex-row items-center justify-between">
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="h-10 w-10 items-center justify-center rounded-full bg-blue-50"><ChevronLeft size={20} color="#2563eb" /></TouchableOpacity>
                <Text className="font-semibold text-slate-800">{monthLabel}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" disabled={currentMonth} onPress={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="h-10 w-10 items-center justify-center rounded-full bg-blue-50" style={{ opacity: currentMonth ? 0.4 : 1 }}><ChevronRight size={20} color="#2563eb" /></TouchableOpacity>
            </View>
            <View className="mt-3 flex-row">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => <View key={`${label}-${index}`} className="h-8 items-center justify-center" style={{ width: '14.2857%' }}><Text className="text-xs font-semibold text-slate-400">{label}</Text></View>)}</View>
            <View className="flex-row flex-wrap">{cells.map((day, index) => {
                if (!day) return <View key={`blank-${index}`} className="mb-1 h-10" style={{ width: '14.2857%' }} />;
                const dateKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isActive = activeDays.has(dateKey);
                return <View key={dateKey} className="mb-1 h-10 items-center justify-center" style={{ width: '14.2857%' }}><View className={`h-9 w-9 items-center justify-center rounded-full ${isActive ? 'bg-emerald-100' : ''}`}><Text className={`text-sm font-medium ${isActive ? 'font-bold text-emerald-800' : 'text-slate-700'}`}>{day}</Text></View></View>;
            })}</View>
            <View className="mt-2 flex-row items-center justify-center"><View className="mr-2 h-3 w-3 rounded-full bg-emerald-200" /><Text className="text-xs text-slate-500">Activity completed</Text></View>
        </View>
        <TouchableOpacity onPress={onHistory} className="mt-4 rounded-full border border-blue-200 bg-white py-4"><Text className="text-center font-bold text-blue-700">Health-test history</Text></TouchableOpacity>
    </View>;
}
