export type ColorVisionDifficulty = 'level-1-easy' | 'level-2-moderate' | 'level-3-challenging';

export type ColorVisionPlate = {
    id: string;
    difficulty: ColorVisionDifficulty;
    level: 1 | 2 | 3;
    answer: number;
    image: number;
};

export const COLOR_VISION_PRACTICE: ColorVisionPlate = {
    id: 'practice/practice-12',
    difficulty: 'level-1-easy',
    level: 1,
    answer: 12,
    image: require('../../assets/wellness/practice/practice-12.png'),
};

export const COLOR_VISION_LEVELS: ColorVisionPlate[][] = [
    [
        { id: 'level-1-easy/plate-01-8', difficulty: 'level-1-easy', level: 1, answer: 8, image: require('../../assets/wellness/level-1-easy/plate-01-8.png') },
        { id: 'level-1-easy/plate-02-6', difficulty: 'level-1-easy', level: 1, answer: 6, image: require('../../assets/wellness/level-1-easy/plate-02-6.png') },
        { id: 'level-1-easy/plate-03-29', difficulty: 'level-1-easy', level: 1, answer: 29, image: require('../../assets/wellness/level-1-easy/plate-03-29.png') },
        { id: 'level-1-easy/plate-04-57', difficulty: 'level-1-easy', level: 1, answer: 57, image: require('../../assets/wellness/level-1-easy/plate-04-57.png') },
        { id: 'level-1-easy/plate-05-3', difficulty: 'level-1-easy', level: 1, answer: 3, image: require('../../assets/wellness/level-1-easy/plate-05-3.png') },
    ],
    [
        { id: 'level-2-moderate/plate-06-15', difficulty: 'level-2-moderate', level: 2, answer: 15, image: require('../../assets/wellness/level-2-moderate/plate-06-15.png') },
        { id: 'level-2-moderate/plate-07-26', difficulty: 'level-2-moderate', level: 2, answer: 26, image: require('../../assets/wellness/level-2-moderate/plate-07-26.png') },
        { id: 'level-2-moderate/plate-08-45', difficulty: 'level-2-moderate', level: 2, answer: 45, image: require('../../assets/wellness/level-2-moderate/plate-08-45.png') },
        { id: 'level-2-moderate/plate-09-74', difficulty: 'level-2-moderate', level: 2, answer: 74, image: require('../../assets/wellness/level-2-moderate/plate-09-74.png') },
        { id: 'level-2-moderate/plate-10-5', difficulty: 'level-2-moderate', level: 2, answer: 5, image: require('../../assets/wellness/level-2-moderate/plate-10-5.png') },
    ],
    [
        { id: 'level-3-challenging/plate-11-16', difficulty: 'level-3-challenging', level: 3, answer: 16, image: require('../../assets/wellness/level-3-challenging/plate-11-16.png') },
        { id: 'level-3-challenging/plate-12-42', difficulty: 'level-3-challenging', level: 3, answer: 42, image: require('../../assets/wellness/level-3-challenging/plate-12-42.png') },
        { id: 'level-3-challenging/plate-13-73', difficulty: 'level-3-challenging', level: 3, answer: 73, image: require('../../assets/wellness/level-3-challenging/plate-13-73.png') },
        { id: 'level-3-challenging/plate-14-8', difficulty: 'level-3-challenging', level: 3, answer: 8, image: require('../../assets/wellness/level-3-challenging/plate-14-8.png') },
        { id: 'level-3-challenging/plate-15-35', difficulty: 'level-3-challenging', level: 3, answer: 35, image: require('../../assets/wellness/level-3-challenging/plate-15-35.png') },
    ],
];

export const COLOR_VISION_PLATES = COLOR_VISION_LEVELS.flat();
export const COLOR_VISION_PLATE_BY_ID = new Map(COLOR_VISION_PLATES.map((plate) => [plate.id, plate]));

function shuffled<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function chooseColorVisionQuestions(recentIds: string[]): ColorVisionPlate[] {
    const recent = new Set(recentIds);
    const chosen: ColorVisionPlate[] = [];
    for (const level of COLOR_VISION_LEVELS) {
        const fresh = shuffled(level.filter((plate) => !recent.has(plate.id)));
        const levelPicks = fresh.slice(0, 2);
        if (levelPicks.length < 2) {
            const used = new Set([...chosen, ...levelPicks].map((plate) => plate.id));
            levelPicks.push(...shuffled(level.filter((plate) => !used.has(plate.id))).slice(0, 2 - levelPicks.length));
        }
        chosen.push(...levelPicks);
    }
    // Keep difficulty progression predictable; plate choice and order within
    // each level remain randomized.
    return chosen;
}

export function colorVisionOptions(answer: number, level: 1 | 2 | 3): number[] {
    const answerWidth = String(answer).length;
    const sameWidth = [...new Set(COLOR_VISION_PLATES
        .filter((plate) => plate.answer !== answer && String(plate.answer).length === answerWidth)
        .map((plate) => plate.answer))];
    const sameLevel = new Set(COLOR_VISION_LEVELS[level - 1]
        .map((plate) => plate.answer)
        .filter((value) => value !== answer && String(value).length === answerWidth));
    const prioritized = sameWidth.sort((left, right) => {
        const levelDifference = Number(sameLevel.has(right)) - Number(sameLevel.has(left));
        return levelDifference || Math.abs(left - answer) - Math.abs(right - answer);
    });
    const distractors = prioritized.slice(0, 3);
    return shuffled([answer, ...distractors]);
}
