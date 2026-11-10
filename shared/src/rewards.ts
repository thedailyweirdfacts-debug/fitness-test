import { quotaDayKey } from "./account.js";
import { calorieGoalHit, type GoalTargets } from "./goals.js";
import { presentMeal } from "./nutrition.js";
import type { FoodItem, LoggedMeal, LogKind, MealType, Recipe } from "./schema.js";

export const MEAL_XP: Record<LogKind, number> = {
  photo: 40,
  barcode: 30,
  recipe: 35,
  typed: 25,
  sample: 15,
};

export const GOAL_DAY_XP = 80;
export const BADGE_XP = 40;
export const CHALLENGE_XP = 120;
export const MAX_FREEZES = 2;
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export const STREAK_XP: Record<(typeof STREAK_MILESTONES)[number], number> = {
  3: 30,
  7: 80,
  14: 140,
  30: 250,
  60: 400,
  100: 700,
};

const LEVEL_TITLES = [
  "Kitchen Cadet",
  "Plate Scout",
  "Snack Spotter",
  "Breakfast Regular",
  "Line Cook",
  "Dinner Apprentice",
  "Macro Mapper",
  "Streak Keeper",
  "Goal Getter",
  "Protein Pro",
  "Recipe Hand",
  "Barcode Reader",
  "Week Warrior",
  "Consistency Captain",
  "Window Walker",
  "Meal Maestro",
  "Freezer Friend",
  "Challenge Champ",
  "Kitchen Captain",
  "Plateful Legend",
];

export type RewardBadge = {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
};

export type ChallengeView = {
  id: string;
  title: string;
  detail: string;
  progress: number;
  target: number;
  completed: boolean;
  xp: number;
};

export type XpEvent = {
  key: string;
  kind: string;
  xp: number;
  week: string;
};

export type RewardView = {
  xp: number;
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForLevel: number;
  currentStreak: number;
  bestStreak: number;
  freezes: number;
  todayHit: boolean;
  weekKey: string;
  weeklyXp: number;
  badges: RewardBadge[];
  challenges: ChallengeView[];
};

export type RewardSnapshot = RewardView & {
  events: XpEvent[];
};

export type FriendBoardEntry = {
  displayName: string;
  level: number;
  weeklyXp: number;
  streak: number;
  you: boolean;
};

export type FriendRequestRow = {
  id: string;
  displayName: string;
  direction: "in" | "out";
};

type ChallengeDef = {
  id: string;
  title: string;
  detail: string;
  target: number;
};

const CHALLENGE_POOL: readonly ChallengeDef[] = [
  { id: "breakfast-5", title: "Breakfast club", detail: "Log breakfast on 5 days this week.", target: 5 },
  { id: "goal-4", title: "In the window", detail: "Land in your calorie window on 4 days.", target: 4 },
  { id: "new-foods-3", title: "Something new", detail: "Log 3 foods you have not written down before this week.", target: 3 },
  { id: "protein-3", title: "Protein run", detail: "Meet your protein goal on 3 days.", target: 3 },
  { id: "photos-4", title: "Camera roll", detail: "Log 4 meals from a photo.", target: 4 },
  { id: "recipe-2", title: "From the pot", detail: "Log 2 servings of a saved recipe.", target: 2 },
  { id: "barcode-3", title: "Scan the box", detail: "Log 3 barcode meals.", target: 3 },
  { id: "four-tags", title: "The whole day", detail: "Log breakfast, lunch, dinner, and a snack on one day.", target: 1 },
  { id: "typed-3", title: "In your words", detail: "Type 3 meals.", target: 3 },
  { id: "snacks-3", title: "Snack shelf", detail: "Log 3 snacks.", target: 3 },
];

const BADGE_DEFS: ReadonlyArray<Omit<RewardBadge, "earned">> = [
  { id: "first-meal", title: "First plate", detail: "You logged a meal." },
  { id: "first-scan", title: "First scan", detail: "You logged a meal from a photo." },
  { id: "full-day", title: "Full day", detail: "Breakfast, lunch, and dinner logged in one day." },
  { id: "all-tags", title: "All four tags", detail: "Breakfast, lunch, dinner, and a snack in one day." },
  { id: "first-goal", title: "In the window", detail: "A day landed near your calorie goal." },
  { id: "streak-3", title: "Three in a row", detail: "Three goal days in a row." },
  { id: "streak-7", title: "A full week", detail: "Seven goal days in a row." },
  { id: "streak-14", title: "Two weeks", detail: "Fourteen goal days in a row." },
  { id: "streak-30", title: "Thirty days", detail: "Thirty goal days in a row." },
  { id: "streak-60", title: "Sixty days", detail: "Sixty goal days in a row." },
  { id: "streak-100", title: "One hundred", detail: "One hundred goal days in a row." },
  { id: "protein-day", title: "Protein covered", detail: "A day met your protein goal." },
  { id: "meals-10", title: "Ten plates", detail: "Ten meals logged." },
  { id: "meals-50", title: "Fifty plates", detail: "Fifty meals logged." },
  { id: "meals-100", title: "Hundred plates", detail: "One hundred meals logged." },
  { id: "first-recipe", title: "First recipe", detail: "You saved a homemade recipe or logged a serving." },
  { id: "barcode-5", title: "Barcode master", detail: "Five barcode meals logged." },
  { id: "photo-10", title: "Shutterbug", detail: "Ten photo meals logged." },
  { id: "typed-10", title: "Word cook", detail: "Ten typed meals logged." },
  { id: "foods-10", title: "Varied plate", detail: "Ten different foods logged." },
  { id: "goal-days-7", title: "Seven windows", detail: "Seven days landed near your calorie goal." },
  { id: "breakfast-5", title: "Morning regular", detail: "Five breakfasts logged." },
  { id: "snack-5", title: "Snack drawer", detail: "Five snacks logged." },
  { id: "freeze-earned", title: "Icebox", detail: "A 7-day streak earned you a streak freeze." },
  { id: "challenge-first", title: "Challenge accepted", detail: "You finished a weekly challenge." },
];

export function inferLogKind(meal: Pick<LoggedMeal, "source" | "photoUri" | "logKind">): LogKind {
  if (meal.logKind) return meal.logKind;
  if (meal.source === "recipe") return "recipe";
  if (meal.source === "sample" || meal.source === "demo") return "sample";
  if (meal.photoUri) return "photo";
  return "typed";
}

export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return 60 + (safe - 1) * 25;
}

export function levelTitle(level: number): string {
  const index = Math.max(1, Math.floor(level)) - 1;
  return LEVEL_TITLES[index] ?? "Plateful Legend";
}

export function levelProgress(xp: number): { level: number; title: string; into: number; span: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < 500) {
    const span = xpForLevel(level);
    if (remaining < span) return { level, title: levelTitle(level), into: remaining, span };
    remaining -= span;
    level += 1;
  }
  return { level, title: levelTitle(level), into: remaining, span: xpForLevel(level) };
}

export function mondayOf(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  const utc = new Date(Date.UTC(year, month - 1, date));
  const weekday = utc.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

export function challengesForWeek(weekKey: string): ChallengeDef[] {
  const [year, month, date] = weekKey.split("-").map(Number);
  const utc = Date.UTC(year || 1970, (month || 1) - 1, date || 1);
  const weeks = Math.floor(utc / (7 * 86_400_000));
  const start = ((weeks % CHALLENGE_POOL.length) + CHALLENGE_POOL.length) % CHALLENGE_POOL.length;
  const picked: ChallengeDef[] = [];
  for (let step = 0; picked.length < 3 && step < CHALLENGE_POOL.length; step += 1) {
    const candidate = CHALLENGE_POOL[(start + step) % CHALLENGE_POOL.length];
    if (candidate && !picked.some((item) => item.id === candidate.id)) picked.push(candidate);
  }
  return picked;
}

export function cleanDisplayName(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, " ").replace(/[^a-zA-Z0-9 ]/g, "");
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  return cleaned;
}

export function normalizeFriendCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type DayFacts = {
  calories: number;
  protein: number;
  types: Set<MealType>;
};

type StreakWalk = {
  current: number;
  best: number;
  freezes: number;
  freezesEarned: number;
  reached: Map<number, string>;
};

export function streakWithFreezes(hitDays: ReadonlySet<string>, today: string): StreakWalk {
  const empty: StreakWalk = { current: 0, best: 0, freezes: 0, freezesEarned: 0, reached: new Map() };
  if (hitDays.size === 0) return empty;
  const earliest = [...hitDays].sort()[0];
  if (!earliest || earliest > today) return empty;

  let current = 0;
  let best = 0;
  let freezes = 0;
  let freezesEarned = 0;
  const granted = new Set<number>();
  const reached = new Map<number, string>();

  for (let day = earliest; day <= today; day = shiftDay(day, 1)) {
    if (hitDays.has(day)) {
      current += 1;
      if (current > best) best = current;
      for (const milestone of STREAK_MILESTONES) {
        if (current >= milestone && !reached.has(milestone)) reached.set(milestone, day);
      }
      const mark = Math.floor(current / 7) * 7;
      for (let step = 7; step <= mark; step += 7) {
        if (granted.has(step)) continue;
        granted.add(step);
        freezesEarned += 1;
        if (freezes < MAX_FREEZES) freezes += 1;
      }
      continue;
    }
    if (day === today) break;
    if (freezes > 0) {
      freezes -= 1;
      continue;
    }
    current = 0;
  }

  return { current, best, freezes, freezesEarned, reached };
}

function mealDay(meal: LoggedMeal): string {
  const date = new Date(meal.loggedAt);
  if (Number.isNaN(date.getTime())) return "1970-01-01";
  return quotaDayKey(date);
}

function foodName(item: FoodItem): string {
  return item.name.trim().toLowerCase();
}

function dedupeMeals(meals: LoggedMeal[]): LoggedMeal[] {
  const byId = new Map<string, LoggedMeal>();
  for (const meal of meals) byId.set(meal.id, meal);
  return [...byId.values()].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id));
}

export function evaluateRewards(input: {
  meals: LoggedMeal[];
  recipes?: Pick<Recipe, "id" | "createdAt">[];
  targets: GoalTargets;
  now?: Date;
}): RewardSnapshot {
  const now = input.now ?? new Date();
  const today = quotaDayKey(now);
  const weekKey = mondayOf(today);
  const meals = dedupeMeals(input.meals).filter((meal) => mealDay(meal) <= today);
  const recipes = input.recipes ?? [];
  const targets = input.targets;
  const facts = new Map<string, DayFacts>();

  for (const meal of meals) {
    const day = mealDay(meal);
    const totals = presentMeal(meal.items).totals;
    const current = facts.get(day) ?? { calories: 0, protein: 0, types: new Set<MealType>() };
    current.calories += totals.calories;
    current.protein += totals.protein;
    current.types.add(meal.mealType);
    facts.set(day, current);
  }

  const hitDays = new Set<string>();
  const proteinDays: string[] = [];
  let fullDay: string | null = null;
  let allTags: string | null = null;
  for (const [day, dayFacts] of [...facts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (calorieGoalHit(dayFacts.calories, targets.calorieGoal, targets.windowPercent)) hitDays.add(day);
    if (targets.proteinGoal != null && targets.proteinGoal > 0 && dayFacts.protein >= targets.proteinGoal) proteinDays.push(day);
    if (!fullDay && ["breakfast", "lunch", "dinner"].every((type) => dayFacts.types.has(type as MealType))) fullDay = day;
    if (!allTags && ["breakfast", "lunch", "dinner", "snack"].every((type) => dayFacts.types.has(type as MealType))) allTags = day;
  }

  const streak = streakWithFreezes(hitDays, today);
  const kinds = meals.map((meal) => ({ meal, kind: inferLogKind(meal), day: mealDay(meal) }));
  const firstOfKind = (kind: LogKind) => kinds.find((item) => item.kind === kind);
  const countKind = (kind: LogKind) => kinds.filter((item) => item.kind === kind).length;
  const nthKind = (kind: LogKind, count: number) => kinds.filter((item) => item.kind === kind)[count - 1];
  const nthMeal = meals[9];
  const fiftieth = meals[49];
  const hundredth = meals[99];
  const breakfasts = meals.filter((meal) => meal.mealType === "breakfast");
  const snacks = meals.filter((meal) => meal.mealType === "snack");
  const namesInOrder: { name: string; day: string }[] = [];
  const seenNames = new Set<string>();
  for (const meal of meals) {
    for (const item of meal.items) {
      const name = foodName(item);
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      namesInOrder.push({ name, day: mealDay(meal) });
    }
  }

  const firstRecipeMeal = firstOfKind("recipe");
  const firstSavedRecipe = [...recipes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const recipeDay = firstRecipeMeal
    ? firstRecipeMeal.day
    : firstSavedRecipe
      ? quotaDayKey(new Date(firstSavedRecipe.createdAt))
      : null;

  const weeks = new Set<string>([weekKey]);
  for (const meal of meals) weeks.add(mondayOf(mealDay(meal)));
  const challengeEvents: XpEvent[] = [];
  let firstChallengeWeek: string | null = null;
  const currentChallenges: ChallengeView[] = [];

  for (const week of [...weeks].sort()) {
    const end = shiftDay(week, 6);
    const weekMeals = kinds.filter((item) => item.day >= week && item.day <= end);
    const weekDays = new Set(weekMeals.map((item) => item.day));
    for (const def of challengesForWeek(week)) {
      const progress = Math.min(def.target, progressFor(def.id, weekMeals, weekDays, hitDays, proteinDays, namesInOrder, facts));
      const completed = progress >= def.target;
      if (completed) {
        challengeEvents.push({ key: `challenge:${week}:${def.id}`, kind: "challenge", xp: CHALLENGE_XP, week });
        if (!firstChallengeWeek) firstChallengeWeek = week;
      }
      if (week === weekKey) {
        currentChallenges.push({ ...def, progress, target: def.target, completed, xp: CHALLENGE_XP });
      }
    }
  }

  const earnedAt = new Map<string, string>();
  const mark = (id: string, day: string | null | undefined) => {
    if (!day || day > today) return;
    earnedAt.set(id, mondayOf(day));
  };
  if (meals[0]) mark("first-meal", mealDay(meals[0]));
  mark("first-scan", firstOfKind("photo")?.day);
  mark("full-day", fullDay);
  mark("all-tags", allTags);
  mark("first-goal", [...hitDays].sort()[0]);
  for (const milestone of STREAK_MILESTONES) mark(`streak-${milestone}`, streak.reached.get(milestone));
  mark("protein-day", proteinDays[0]);
  mark("meals-10", nthMeal ? mealDay(nthMeal) : null);
  mark("meals-50", fiftieth ? mealDay(fiftieth) : null);
  mark("meals-100", hundredth ? mealDay(hundredth) : null);
  if (recipeDay && recipeDay <= today) mark("first-recipe", recipeDay);
  mark("barcode-5", nthKind("barcode", 5)?.day);
  mark("photo-10", nthKind("photo", 10)?.day);
  mark("typed-10", nthKind("typed", 10)?.day);
  mark("foods-10", namesInOrder[9]?.day);
  mark("goal-days-7", [...hitDays].sort()[6]);
  mark("breakfast-5", breakfasts[4] ? mealDay(breakfasts[4]) : null);
  mark("snack-5", snacks[4] ? mealDay(snacks[4]) : null);
  mark("freeze-earned", streak.reached.get(7));
  mark("challenge-first", firstChallengeWeek ? shiftDay(firstChallengeWeek, 0) : null);

  const events: XpEvent[] = [];
  for (const item of kinds) {
    events.push({
      key: `meal:${item.meal.id}`,
      kind: `meal-${item.kind}`,
      xp: MEAL_XP[item.kind],
      week: mondayOf(item.day),
    });
  }
  for (const day of [...hitDays].sort()) {
    events.push({ key: `goal:${day}`, kind: "goal", xp: GOAL_DAY_XP, week: mondayOf(day) });
  }
  for (const milestone of STREAK_MILESTONES) {
    const day = streak.reached.get(milestone);
    if (!day) continue;
    events.push({ key: `streak:${milestone}`, kind: "streak", xp: STREAK_XP[milestone], week: mondayOf(day) });
  }
  for (const [id, week] of earnedAt) {
    events.push({ key: `badge:${id}`, kind: "badge", xp: BADGE_XP, week });
  }
  events.push(...challengeEvents);

  const unique = new Map<string, XpEvent>();
  for (const event of events) unique.set(event.key, event);
  const list = [...unique.values()];
  const xp = list.reduce((sum, event) => sum + event.xp, 0);
  const weeklyXp = list.filter((event) => event.week === weekKey).reduce((sum, event) => sum + event.xp, 0);
  const progress = levelProgress(xp);
  const badges = BADGE_DEFS.map((badge) => ({ ...badge, earned: earnedAt.has(badge.id) }));

  return {
    xp,
    level: progress.level,
    title: progress.title,
    xpIntoLevel: progress.into,
    xpForLevel: progress.span,
    currentStreak: streak.current,
    bestStreak: streak.best,
    freezes: streak.freezes,
    todayHit: hitDays.has(today),
    weekKey,
    weeklyXp,
    badges,
    challenges: currentChallenges,
    events: list,
  };
}

function progressFor(
  id: string,
  weekMeals: Array<{ meal: LoggedMeal; kind: LogKind; day: string }>,
  weekDays: Set<string>,
  hitDays: Set<string>,
  proteinDays: string[],
  namesInOrder: Array<{ name: string; day: string }>,
  facts: Map<string, DayFacts>,
): number {
  if (id === "breakfast-5") return new Set(weekMeals.filter((item) => item.meal.mealType === "breakfast").map((item) => item.day)).size;
  if (id === "goal-4") return [...weekDays].filter((day) => hitDays.has(day)).length;
  if (id === "new-foods-3") return namesInOrder.filter((item) => weekDays.has(item.day)).length;
  if (id === "protein-3") return proteinDays.filter((day) => weekDays.has(day)).length;
  if (id === "photos-4") return weekMeals.filter((item) => item.kind === "photo").length;
  if (id === "recipe-2") return weekMeals.filter((item) => item.kind === "recipe").length;
  if (id === "barcode-3") return weekMeals.filter((item) => item.kind === "barcode").length;
  if (id === "typed-3") return weekMeals.filter((item) => item.kind === "typed").length;
  if (id === "snacks-3") return weekMeals.filter((item) => item.meal.mealType === "snack").length;
  if (id === "four-tags") {
    for (const day of weekDays) {
      const types = facts.get(day)?.types;
      if (types && ["breakfast", "lunch", "dinner", "snack"].every((type) => types.has(type as MealType))) return 1;
    }
    return 0;
  }
  return 0;
}

export function toRewardView(snapshot: RewardSnapshot): RewardView {
  const { events: _events, ...view } = snapshot;
  return view;
}

export const REWARD_BADGE_COUNT = BADGE_DEFS.length;

export type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted";
};

export function applyFriendRequest(
  records: readonly Friendship[],
  requesterId: string,
  addresseeId: string,
  id: string,
): { records: Friendship[]; status: "pending" | "accepted" | "already" | "self" } {
  if (requesterId === addresseeId) return { records: [...records], status: "self" };
  const existing = records.find(
    (row) =>
      (row.requesterId === requesterId && row.addresseeId === addresseeId) ||
      (row.requesterId === addresseeId && row.addresseeId === requesterId),
  );
  if (!existing) {
    return {
      records: [...records, { id, requesterId, addresseeId, status: "pending" }],
      status: "pending",
    };
  }
  if (existing.status === "accepted") return { records: [...records], status: "already" };
  if (existing.requesterId === addresseeId) {
    return {
      records: records.map((row) => (row.id === existing.id ? { ...row, status: "accepted" } : row)),
      status: "accepted",
    };
  }
  return { records: [...records], status: "pending" };
}

export function respondToFriend(
  records: readonly Friendship[],
  userId: string,
  friendshipId: string,
  accept: boolean,
): { records: Friendship[]; ok: boolean } {
  const existing = records.find((row) => row.id === friendshipId);
  if (!existing || existing.addresseeId !== userId || existing.status !== "pending") {
    return { records: [...records], ok: false };
  }
  if (!accept) return { records: records.filter((row) => row.id !== friendshipId), ok: true };
  return {
    records: records.map((row) => (row.id === friendshipId ? { ...row, status: "accepted" } : row)),
    ok: true,
  };
}
