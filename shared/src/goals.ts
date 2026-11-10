import { dayKeyFromDate, addDays, dailyTotals } from "./dates.js";
import { presentMeal } from "./nutrition.js";
import type { LoggedMeal, MealType } from "./schema.js";

export type GoalTargets = {
  calorieGoal: number | null;
  proteinGoal: number | null;
  windowPercent: number;
};

export type DayGoalStatus = {
  day: string;
  calories: number;
  protein: number;
  calorieGoal: number | null;
  proteinGoal: number | null;
  windowPercent: number;
  low: number | null;
  high: number | null;
  hit: boolean;
  proteinMet: boolean;
};

export type Badge = {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
};

export type RewardReport = {
  today: DayGoalStatus;
  currentStreak: number;
  bestStreak: number;
  badges: Badge[];
  hitDays: string[];
};

export type SeenRewards = {
  badges: string[];
  goalDays: string[];
};

export type FreshRewards = {
  badges: Badge[];
  goalDay: boolean;
};

const FULL_DAY: readonly MealType[] = ["breakfast", "lunch", "dinner"];

export const BADGE_CATALOG: ReadonlyArray<Omit<Badge, "earned">> = [
  { id: "first-meal", title: "First plate", detail: "You logged a meal." },
  { id: "full-day", title: "Full day", detail: "Breakfast, lunch, and dinner logged in one day." },
  { id: "first-goal", title: "In the window", detail: "A day landed near your calorie goal." },
  { id: "streak-3", title: "Three in a row", detail: "Three goal days in a row." },
  { id: "streak-7", title: "A full week", detail: "Seven goal days in a row." },
  { id: "streak-30", title: "Thirty days", detail: "Thirty goal days in a row." },
  { id: "protein-day", title: "Protein covered", detail: "A day met your protein goal." },
];

export function clampWindow(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(50, Math.max(1, Math.round(value)));
}

export function parseGoalInput(text: string, max: number): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  if (value < 1 || value > max) return "invalid";
  return value;
}

export function goalBounds(goal: number, windowPercent: number): { low: number; high: number } {
  const window = clampWindow(windowPercent) / 100;
  return {
    low: Math.round(goal * (1 - window)),
    high: Math.round(goal * (1 + window)),
  };
}

export function calorieGoalHit(calories: number, goal: number | null, windowPercent: number): boolean {
  if (goal == null || goal <= 0 || calories <= 0) return false;
  const { low, high } = goalBounds(goal, windowPercent);
  return calories >= low && calories <= high;
}

export function dayGoalStatus(meals: LoggedMeal[], day: string, targets: GoalTargets): DayGoalStatus {
  const totals = dailyTotals(meals, day);
  const windowPercent = clampWindow(targets.windowPercent);
  const bounds = targets.calorieGoal != null && targets.calorieGoal > 0 ? goalBounds(targets.calorieGoal, windowPercent) : null;
  return {
    day,
    calories: totals.calories,
    protein: totals.protein,
    calorieGoal: targets.calorieGoal,
    proteinGoal: targets.proteinGoal,
    windowPercent,
    low: bounds?.low ?? null,
    high: bounds?.high ?? null,
    hit: calorieGoalHit(totals.calories, targets.calorieGoal, windowPercent),
    proteinMet: targets.proteinGoal != null && targets.proteinGoal > 0 && totals.protein >= targets.proteinGoal,
  };
}

export function progressCopy(status: DayGoalStatus): string {
  if (status.calorieGoal == null || status.low == null || status.high == null) return "";
  if (status.calories <= 0) return "Log a meal and today's bar will start.";
  if (status.hit) return "This day is in the window. That's the win.";
  if (status.calories < status.low) {
    return `${status.low - status.calories} kcal until the window opens.`;
  }
  return "Above the window. A closer day is what keeps a streak going.";
}

type DayFacts = {
  calories: number;
  protein: number;
  types: Set<MealType>;
};

function factsByDay(meals: LoggedMeal[]): Map<string, DayFacts> {
  const map = new Map<string, DayFacts>();
  for (const meal of meals) {
    const day = dayKeyFromDate(new Date(meal.loggedAt));
    const totals = presentMeal(meal.items).totals;
    const current = map.get(day) ?? { calories: 0, protein: 0, types: new Set<MealType>() };
    current.calories += totals.calories;
    current.protein += totals.protein;
    current.types.add(meal.mealType);
    map.set(day, current);
  }
  return map;
}

export function streakStats(hitDays: ReadonlySet<string>, today: string): { current: number; best: number } {
  if (hitDays.size === 0) return { current: 0, best: 0 };
  const earliest = [...hitDays].sort()[0];
  if (!earliest || earliest > today) return { current: 0, best: 0 };

  let best = 0;
  let run = 0;
  for (let day = earliest; day <= today; day = addDays(day, 1)) {
    if (hitDays.has(day)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  let current = 0;
  let cursor = hitDays.has(today) ? today : addDays(today, -1);
  while (hitDays.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

export function buildRewardReport(meals: LoggedMeal[], targets: GoalTargets, today: string): RewardReport {
  const facts = factsByDay(meals);
  const hitDays = new Set<string>();
  let proteinDay = false;
  let fullDay = false;
  for (const [day, factsForDay] of facts) {
    if (day > today) continue;
    if (calorieGoalHit(factsForDay.calories, targets.calorieGoal, targets.windowPercent)) hitDays.add(day);
    if (targets.proteinGoal != null && targets.proteinGoal > 0 && factsForDay.protein >= targets.proteinGoal) proteinDay = true;
    if (FULL_DAY.every((type) => factsForDay.types.has(type))) fullDay = true;
  }
  const streaks = targets.calorieGoal != null ? streakStats(hitDays, today) : { current: 0, best: 0 };
  const earned = new Set<string>();
  if (meals.some((meal) => dayKeyFromDate(new Date(meal.loggedAt)) <= today)) earned.add("first-meal");
  if (fullDay) earned.add("full-day");
  if (hitDays.size > 0) earned.add("first-goal");
  if (streaks.best >= 3) earned.add("streak-3");
  if (streaks.best >= 7) earned.add("streak-7");
  if (streaks.best >= 30) earned.add("streak-30");
  if (proteinDay) earned.add("protein-day");

  const badges = BADGE_CATALOG.filter((badge) => badge.id !== "protein-day" || targets.proteinGoal != null).map((badge) => ({
    ...badge,
    earned: earned.has(badge.id),
  }));

  return {
    today: dayGoalStatus(meals, today, targets),
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    badges,
    hitDays: [...hitDays].sort(),
  };
}

export function freshRewards(report: RewardReport, seen: SeenRewards, today: string): FreshRewards {
  return {
    badges: report.badges.filter((badge) => badge.earned && !seen.badges.includes(badge.id)),
    goalDay: report.today.hit && !seen.goalDays.includes(today),
  };
}

export function markRewardsSeen(seen: SeenRewards, fresh: FreshRewards, today: string): SeenRewards {
  const badges = [...seen.badges];
  for (const badge of fresh.badges) {
    if (!badges.includes(badge.id)) badges.push(badge.id);
  }
  const goalDays = [...seen.goalDays];
  if (fresh.goalDay && !goalDays.includes(today)) goalDays.push(today);
  return { badges, goalDays };
}
