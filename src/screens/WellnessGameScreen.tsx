import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { ArrowLeft, Clock3, RotateCcw, Sparkles, Trophy } from 'lucide-react-native';
import type { WellnessGame } from '../lib/wellnessContent';
import { WORD_BANK } from '../lib/wellnessContent';

type Props = { game: WellnessGame; contentId: string; onBack: () => void; onComplete: () => void };
const shapes = ['circle', 'triangle', 'square', 'star', 'moon', 'diamond'];
const colors = ['#ec4899', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'];
const previousMemoryLayouts = new Map<string, string[]>();
const previousLogicPuzzles = new Map<string, string>();
const previousSudokuPuzzles = new Map<string, string>();
const previousPatternPuzzles = new Map<string, string>();
const usedWordPuzzles = new Map<string, string[]>();
const seedFrom = (id: string) => Number(id.split('-')[id.split('-').length - 1] || 0) || 0;
function isCompleteMiniSudoku(grid: number[][]) {
    if (!grid.every((row) => row.every((value) => value > 0))) return false;
    const groups = [
        ...grid,
        ...grid[0].map((_, column) => grid.map((row) => row[column])),
        [0, 1].flatMap((row) => [0, 1].map((column) => grid[row][column])),
        [0, 1].flatMap((row) => [2, 3].map((column) => grid[row][column])),
        [2, 3].flatMap((row) => [0, 1].map((column) => grid[row][column])),
        [2, 3].flatMap((row) => [2, 3].map((column) => grid[row][column])),
    ];
    return groups.every((group) => group.length === 4 && new Set(group).size === 4 && group.every((value) => value >= 1 && value <= 4));
}
const shuffleRandom = <T,>(items: T[]): T[] => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
};
function createMemoryDeck(gameId: string) {
    const cards = shapes.map((value, pair) => [
        { id: `${pair}-a`, pair, value },
        { id: `${pair}-b`, pair, value },
    ]).flat();
    const previous = previousMemoryLayouts.get(gameId);
    let deck: typeof cards;
    if (!previous) deck = shuffleRandom(cards);
    else {
        // Build a randomized derangement: each symbol appears twice, but none
        // remains in either of its previous grid positions.
        const remaining = new Map(shapes.map((value) => [value, 2]));
        const nextValues: string[] = [];
        const place = (index: number): boolean => {
            if (index === cards.length) return true;
            const candidates = shuffleRandom(shapes.filter((value) => value !== previous[index] && (remaining.get(value) || 0) > 0));
            for (const value of candidates) {
                remaining.set(value, (remaining.get(value) || 0) - 1);
                nextValues[index] = value;
                if (place(index + 1)) return true;
                remaining.set(value, (remaining.get(value) || 0) + 1);
            }
            return false;
        };
        if (place(0)) {
            const occurrences = new Map<string, number>();
            deck = nextValues.map((value) => {
                const pair = shapes.indexOf(value);
                const occurrence = occurrences.get(value) || 0;
                occurrences.set(value, occurrence + 1);
                return { id: `${pair}-${occurrence === 0 ? 'a' : 'b'}`, pair, value };
            });
        } else deck = shuffleRandom(cards);
    }
    previousMemoryLayouts.set(gameId, deck.map((card) => card.value));
    return deck;
}
function createLogicPuzzle(gameId: string) {
    const previous = previousLogicPuzzles.get(gameId);
    let start = 2;
    let step = 2;
    let signature = '';
    do {
        start = 2 + Math.floor(Math.random() * 11);
        step = 2 + Math.floor(Math.random() * 8);
        signature = `${start}:${step}`;
    } while (signature === previous);

    previousLogicPuzzles.set(gameId, signature);
    const answer = start + step * 3;
    return { start, step, answer, options: shuffleRandom([answer, answer + 1, answer - 2]) };
}
function createSudokuPuzzle(gameId: string) {
    const base = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
    const previous = previousSudokuPuzzles.get(gameId);
    let grid: number[][] = [];
    let signature = '';

    do {
        const rowOrder = shuffleRandom([[0, 1], [2, 3]]).flatMap((band) => shuffleRandom(band));
        const columnOrder = shuffleRandom([[0, 1], [2, 3]]).flatMap((stack) => shuffleRandom(stack));
        const digits = shuffleRandom([1, 2, 3, 4]);
        const solution = rowOrder.map((row) => columnOrder.map((column) => digits[base[row][column] - 1]));
        const blankCells = shuffleRandom(Array.from({ length: 16 }, (_, index) => index)).slice(0, 5);
        const blanks = new Set(blankCells);
        grid = solution.map((row, rowIndex) => row.map((value, columnIndex) => (
            blanks.has(rowIndex * 4 + columnIndex) ? 0 : value
        )));
        signature = grid.flat().join('');
    } while (signature === previous);

    previousSudokuPuzzles.set(gameId, signature);
    return grid;
}
function createWordPuzzle(gameId: string) {
    const previouslyUsed = usedWordPuzzles.get(gameId) || [];
    let availableWords = WORD_BANK.filter((word) => !previouslyUsed.includes(word));
    let usedWords = previouslyUsed;

    if (availableWords.length === 0) {
        // Cycle through the bank without repeating the word from the last round.
        usedWords = previouslyUsed.slice(-1);
        availableWords = WORD_BANK.filter((word) => !usedWords.includes(word));
    }

    const word = availableWords[Math.floor(Math.random() * availableWords.length)];
    usedWordPuzzles.set(gameId, [...usedWords, word]);
    return {
        word,
        letters: shuffleRandom(word.split('').map((letter, id) => ({ letter, id }))),
    };
}
function createPatternPuzzle(gameId: string) {
    const previous = previousPatternPuzzles.get(gameId);
    let startIndex = 0;
    let step = 1;
    let signature = '';
    do {
        startIndex = Math.floor(Math.random() * shapes.length);
        step = Math.random() < 0.5 ? 1 : 2;
        signature = `${startIndex}:${step}`;
    } while (signature === previous);

    previousPatternPuzzles.set(gameId, signature);
    const answer = shapes[(startIndex + step * 3) % shapes.length];
    const distractors = shuffleRandom(shapes.filter((shape) => shape !== answer)).slice(0, 2);
    return {
        startIndex,
        step,
        answer,
        options: shuffleRandom([answer, ...distractors]),
    };
}

export default function WellnessGameScreen({ game, contentId, onBack, onComplete }: Props) {
    const seed = seedFrom(contentId);
    const [round, setRound] = useState(0);
    const [done, setDone] = useState(false);
    const [notice, setNotice] = useState('');
    const completeOnce = useRef(false);
    const finish = () => { if (!completeOnce.current) { completeOnce.current = true; setDone(true); onComplete(); } };
    const onAnswer = (correct: boolean) => {
        if (correct) finish(); else setNotice('Not quite. Try another answer.');
    };

    const puzzle = useMemo(() => {
        if (game.kind === 'memory') {
            return createMemoryDeck(game.id);
        }
        if (game.kind === 'sudoku') {
            return createSudokuPuzzle(game.id);
        }
        if (game.kind === 'word') {
            return createWordPuzzle(game.id);
        }
        return null;
    }, [game.id, game.kind, seed, round]);
    const logicPuzzle = useMemo(
        () => (game.kind === 'logic' ? createLogicPuzzle(game.id) : null),
        [game.id, game.kind, round],
    );
    const patternPuzzle = useMemo(
        () => (game.kind === 'pattern' ? createPatternPuzzle(game.id) : null),
        [game.id, game.kind, round],
    );

    const [flipped, setFlipped] = useState<string[]>([]);
    const [matched, setMatched] = useState<number[]>([]);
    useEffect(() => {
        if (flipped.length !== 2) return;
        const a = (puzzle as Array<{ id: string; pair: number; value: string }> | null)?.find((card) => card.id === flipped[0]);
        const b = (puzzle as Array<{ id: string; pair: number; value: string }> | null)?.find((card) => card.id === flipped[1]);
        const timer = setTimeout(() => {
            if (a && b && a.pair === b.pair) {
                const next = [...matched, a.pair]; setMatched(next);
                if (next.length === 6) finish();
            }
            setFlipped([]);
        }, a?.pair === b?.pair ? 280 : 720);
        return () => clearTimeout(timer);
    }, [flipped, matched, puzzle]);

    const [sudokuValues, setSudokuValues] = useState<number[][]>([]);
    useEffect(() => { if (game.kind === 'sudoku') setSudokuValues((puzzle as number[][]).map((row) => [...row])); }, [game.kind, puzzle]);
    const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
    const [wordChosen, setWordChosen] = useState<number[]>([]);
    const [reactionState, setReactionState] = useState<'wait' | 'ready' | 'false'>('wait');
    const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const readyAt = useRef(0);
    const [reactionMs, setReactionMs] = useState<number | null>(null);
    const startReaction = () => {
        if (reactionTimer.current) clearTimeout(reactionTimer.current);
        setReactionState('wait'); setReactionMs(null);
        const waitMs = 1000 + Math.floor(Math.random() * 1501);
        reactionTimer.current = setTimeout(() => { readyAt.current = Date.now(); setReactionState('ready'); }, waitMs);
    };
    const reset = () => {
        completeOnce.current = false; setDone(false); setNotice(''); setFlipped([]); setMatched([]);
        setWordChosen([]); setSelectedCell(null);
        if (game.kind === 'sudoku' && puzzle) setSudokuValues((puzzle as number[][]).map((row) => [...row]));
        setReactionState('wait'); setReactionMs(null); setRound((value) => value + 1);
    };
    useEffect(() => { if (game.kind === 'reaction') startReaction(); return () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); }; }, [game.kind, contentId, round]);

    let instruction = 'Read the instructions, then play at your own pace.';
    if (game.kind === 'memory') instruction = 'Tap two cards at a time and find all six matching pairs.';
    if (game.kind === 'logic') instruction = 'Look at the number pattern and choose the next number.';
    if (game.kind === 'sudoku') instruction = 'Tap an empty square, then choose a number. Each row, column, and 2 × 2 box must contain 1–4 once.';
    if (game.kind === 'word') instruction = 'Tap the letters in order to make the hidden word.';
    if (game.kind === 'pattern') instruction = 'Choose the shape that should come next.';
    if (game.kind === 'reaction') instruction = 'Wait for the panel to turn green, then tap as quickly as you comfortably can.';

    return (
        <View className="flex-1 bg-slate-50">
            <View className="rounded-b-[28px] bg-blue-700 px-5 pb-5 pt-3">
                <TouchableOpacity onPress={onBack} className="mb-3 flex-row items-center"><ArrowLeft size={20} color="white" /><Text className="ml-2 text-white">Brain Games</Text></TouchableOpacity>
                <Text className="text-2xl font-bold text-white">{game.title}</Text>
                <View className="mt-2 flex-row items-center self-start rounded-full bg-white/15 px-3 py-1.5"><Clock3 size={19} color="white" strokeWidth={2.5} /><Text className="ml-2 text-sm font-semibold text-white">{game.duration}</Text></View>
            </View>
            <View className="flex-1 px-4 pt-4">
                {done ? <View className="flex-1 items-center justify-center rounded-3xl bg-white p-6 shadow-sm">
                    <Trophy size={58} color="#f59e0b" /><Text className="mt-4 text-2xl font-bold text-slate-900">Great job!</Text><Text className="mt-2 text-center text-slate-600">You finished {game.title}. Nice work!</Text>
                    {game.kind === 'reaction' && reactionMs != null ? <Text className="mt-3 text-slate-500">Reaction: {reactionMs} ms</Text> : null}
                    <TouchableOpacity onPress={reset} className="mt-7 w-full rounded-full bg-blue-600 py-4"><Text className="text-center font-bold text-white">Play Again</Text></TouchableOpacity>
                    <TouchableOpacity onPress={onBack} className="mt-3 w-full rounded-full border border-blue-200 bg-blue-50 py-4"><Text className="text-center font-semibold text-blue-700">Back to Games</Text></TouchableOpacity>
                </View> : <View className="flex-1 rounded-3xl bg-white p-4 shadow-sm">
                    <View className="mb-1 flex-row items-center"><View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-blue-50"><Sparkles size={17} color="#2563eb" /></View><Text className="text-base font-bold text-slate-900">How to play</Text></View><Text className="text-sm leading-5 text-slate-600">{instruction}</Text>
                    {game.kind === 'memory' ? <>
                        <Text className="mt-4 text-right text-sm font-semibold text-slate-500">Pairs: {matched.length}/6</Text>
                        <View className="mt-3 flex-row flex-wrap justify-between">
                            {(puzzle as Array<{ id: string; pair: number; value: string }>).map((card) => {
                                const shown = flipped.includes(card.id) || matched.includes(card.pair);
                                return <TouchableOpacity key={card.id} accessibilityLabel={shown ? `Matching shape ${card.pair + 1}` : 'Hidden matching card'} onPress={() => { if (shown || flipped.length === 2) return; setFlipped((list) => [...list, card.id]); }} className="mb-2 h-[74px] w-[31.5%] items-center justify-center rounded-2xl" style={{ backgroundColor: shown ? '#fff0f7' : '#dbeafe' }}>{shown ? <WellnessShape shape={card.value} color={colors[card.pair]} /> : <Text className="text-3xl text-blue-500">✦</Text>}</TouchableOpacity>;
                            })}
                        </View>
                    </> : null}
                    {game.kind === 'logic' && logicPuzzle ? <View className="mt-8 items-center"><Text className="text-sm font-semibold text-blue-600">NUMBER SEQUENCE</Text><Text className="mt-5 text-4xl font-bold tracking-widest text-slate-900">{[0, 1, 2].map((n) => logicPuzzle.start + logicPuzzle.step * n).join('   ')}   ?</Text><View className="mt-7 w-full gap-3">{logicPuzzle.options.map((value) => <AnswerButton key={value} text={String(value)} onPress={() => onAnswer(value === logicPuzzle.answer)} />)}</View></View> : null}
                    {game.kind === 'pattern' && patternPuzzle ? <View className="mt-8 items-center"><Text className="text-sm font-semibold text-violet-600">WHAT COMES NEXT?</Text><View className="mt-5 flex-row items-center gap-3">{[0, 1, 2].map((n) => { const shapeIndex = (patternPuzzle.startIndex + n * patternPuzzle.step) % shapes.length; return <WellnessShape key={n} shape={shapes[shapeIndex]} color={colors[shapeIndex]} />; })}<Text className="text-3xl font-bold text-slate-500">?</Text></View><View className="mt-7 w-full flex-row justify-around">{patternPuzzle.options.map((value) => <TouchableOpacity key={value} onPress={() => onAnswer(value === patternPuzzle.answer)} className="h-20 w-[30%] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50"><WellnessShape shape={value} color={colors[shapes.indexOf(value)]} /></TouchableOpacity>)}</View></View> : null}
                    {game.kind === 'word' ? <View className="mt-8 items-center"><Text className="text-sm font-semibold text-orange-600">UNSCRAMBLE THE WORD</Text><Text className="mt-5 text-3xl font-bold tracking-[8px] text-slate-900">{(puzzle as { word: string; letters: { letter: string; id: number }[] }).letters.map((letter) => letter.letter).join('')}</Text><Text className="mt-5 min-h-9 text-2xl font-bold tracking-[6px] text-blue-700">{wordChosen.map((id) => (puzzle as { word: string; letters: { letter: string; id: number }[] }).letters.find((l) => l.id === id)?.letter).join('')}</Text><View className="mt-5 flex-row flex-wrap justify-center">{(puzzle as { word: string; letters: { letter: string; id: number }[] }).letters.map((letter) => <TouchableOpacity key={letter.id} disabled={wordChosen.includes(letter.id)} onPress={() => { const next = [...wordChosen, letter.id]; setWordChosen(next); const answer = next.map((id) => (puzzle as { letters: { letter: string; id: number }[] }).letters.find((l) => l.id === id)?.letter).join(''); if (answer.length === (puzzle as { word: string }).word.length) onAnswer(answer === (puzzle as { word: string }).word); }} className="m-1 h-12 w-12 items-center justify-center rounded-xl bg-orange-100"><Text className="text-xl font-bold text-orange-700">{letter.letter}</Text></TouchableOpacity>)}</View><View className="mt-4 flex-row items-center gap-5"><TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove last selected letter" disabled={wordChosen.length === 0} onPress={() => setWordChosen((chosen) => chosen.slice(0, -1))} className="rounded-full bg-blue-50 px-4 py-2"><Text className="font-semibold text-blue-700">⌫ Undo</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear all selected letters" onPress={() => setWordChosen([])} className="rounded-full bg-orange-50 px-4 py-2"><Text className="font-semibold text-orange-700">Clear all</Text></TouchableOpacity></View></View> : null}
                    {game.kind === 'sudoku' ? <View className="mt-7 items-center"><Text className="mb-3 text-sm text-slate-600">Mini Sudoku · 4 × 4</Text><View className="w-64 flex-row flex-wrap border-2 border-blue-700">{sudokuValues.flatMap((row, r) => row.map((value, c) => <TouchableOpacity key={`${r}-${c}`} onPress={() => { if (!(puzzle as number[][])[r][c]) setSelectedCell([r, c]); }} className="h-16 w-1/4 items-center justify-center border border-slate-300" style={{ backgroundColor: selectedCell?.[0] === r && selectedCell?.[1] === c ? '#dbeafe' : 'white' }}><Text className="text-2xl font-semibold text-slate-900">{value || ''}</Text></TouchableOpacity>))}</View><View className="mt-4 flex-row gap-3">{[1, 2, 3, 4].map((n) => <TouchableOpacity key={n} onPress={() => { if (!selectedCell) { setNotice('Choose an empty square first.'); return; } const next = sudokuValues.map((row) => [...row]); next[selectedCell[0]][selectedCell[1]] = n; setSudokuValues(next); if (isCompleteMiniSudoku(next)) finish(); }} className="h-12 w-12 items-center justify-center rounded-xl bg-blue-100"><Text className="text-xl font-bold text-blue-700">{n}</Text></TouchableOpacity>)}</View></View> : null}
                    {game.kind === 'reaction' ? <View className="mt-8 flex-1 items-center justify-center"><Text className="mb-5 text-center text-slate-600">{reactionState === 'wait' ? 'Wait for green…' : reactionState === 'false' ? 'Too soon! Try again.' : 'Tap now!'}</Text><TouchableOpacity onPress={() => { if (reactionState === 'wait') { if (reactionTimer.current) clearTimeout(reactionTimer.current); setReactionState('false'); } else if (reactionState === 'false') startReaction(); else { const ms = Date.now() - readyAt.current; setReactionMs(ms); finish(); } }} className="h-52 w-full items-center justify-center rounded-3xl" style={{ backgroundColor: reactionState === 'ready' ? '#22c55e' : reactionState === 'false' ? '#fecaca' : '#dbeafe' }}><Text className="text-2xl font-bold text-slate-900">{reactionState === 'ready' ? 'TAP!' : reactionState === 'false' ? 'Try again' : 'Wait…'}</Text></TouchableOpacity></View> : null}
                    {notice ? <Text className="mt-4 text-center font-medium text-rose-600">{notice}</Text> : null}
                    <TouchableOpacity onPress={() => Alert.alert('Restart game?', 'Your current round will restart.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restart', onPress: reset }])} className="mt-auto flex-row items-center justify-center pt-5"><RotateCcw size={16} color="#2563eb" /><Text className="ml-2 font-semibold text-blue-600">Restart</Text></TouchableOpacity>
                </View>}
            </View>
        </View>
    );
}

function AnswerButton({ text, onPress }: { text: string; onPress: () => void }) {
    return <TouchableOpacity onPress={onPress} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><Text className="text-center text-lg font-semibold text-slate-800">{text}</Text></TouchableOpacity>;
}

function WellnessShape({ shape, color }: { shape: string; color: string }) {
    return <Svg width={38} height={38} viewBox="0 0 32 32">
        {shape === 'circle' ? <Circle cx="16" cy="16" r="12" fill={color} /> : null}
        {shape === 'triangle' ? <Polygon points="16,3 29,28 3,28" fill={color} /> : null}
        {shape === 'square' ? <Rect x="4" y="4" width="24" height="24" rx="5" fill={color} /> : null}
        {shape === 'star' ? <Polygon points="16,2 19.8,11.5 30,12.2 22.2,18.8 24.7,29 16,23.4 7.3,29 9.8,18.8 2,12.2 12.2,11.5" fill={color} /> : null}
        {shape === 'moon' ? <Path d="M22.5 4.5a12 12 0 1 0 5 21.5A10 10 0 0 1 22.5 4.5Z" fill={color} /> : null}
        {shape === 'diamond' ? <Polygon points="16,2 29,16 16,30 3,16" fill={color} /> : null}
    </Svg>;
}
