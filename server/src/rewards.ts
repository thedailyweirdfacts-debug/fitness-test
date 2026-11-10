import {
  evaluateRewards,
  normalizeFriendCode,
  respondToFriend,
  toRewardView,
  applyFriendRequest,
  type FriendBoardEntry,
  type FriendRequestRow,
  type Friendship,
  type GoalTargets,
  type LoggedMeal,
  type RewardSnapshot,
  loggedMealSchema,
} from "../../shared/src/index.js";

export type RewardHistory = {
  meals: LoggedMeal[];
  recipes: Array<{ id: string; createdAt: string }>;
  targets: GoalTargets;
};

export type RewardSocial = {
  friendCode: string;
  displayName: string;
  board: FriendBoardEntry[];
  requests: FriendRequestRow[];
};

export type RewardActionResult = { ok: true; status?: string; displayName?: string } | { ok: false; message: string };

export type RewardStore = {
  load(userId: string): Promise<RewardHistory>;
  save(userId: string, snapshot: RewardSnapshot): Promise<void>;
  social(userId: string): Promise<RewardSocial>;
  rename(userId: string, displayName: string): Promise<RewardActionResult>;
  requestFriend(userId: string, code: string): Promise<RewardActionResult>;
  respond(userId: string, friendshipId: string, accept: boolean): Promise<RewardActionResult>;
};

export class RewardsNotReady extends Error {
  constructor() {
    super("rewards");
    this.name = "RewardsNotReady";
  }
}

const EMPTY_HISTORY: RewardHistory = {
  meals: [],
  recipes: [],
  targets: { calorieGoal: null, proteinGoal: null, windowPercent: 10 },
};

const LOG_KINDS = new Set(["photo", "typed", "barcode", "recipe", "sample"]);

type MemoryProfile = {
  displayName: string;
  friendCode: string;
  snapshot: RewardSnapshot | null;
};

export function createMemoryRewardStore(): RewardStore & {
  setHistory(userId: string, history: RewardHistory): void;
  setCode(userId: string, code: string, displayName: string): void;
} {
  const histories = new Map<string, RewardHistory>();
  const profiles = new Map<string, MemoryProfile>();
  let friendships: Friendship[] = [];
  let nextId = 1;

  function ensure(userId: string): MemoryProfile {
    const existing = profiles.get(userId);
    if (existing) return existing;
    const created = { displayName: "Friend", friendCode: `CODE${userId.slice(0, 2).toUpperCase()}`, snapshot: null };
    profiles.set(userId, created);
    return created;
  }

  function social(userId: string): RewardSocial {
    const profile = ensure(userId);
    const ids = new Set<string>([userId]);
    for (const row of friendships) {
      if (row.status !== "accepted") continue;
      if (row.requesterId === userId) ids.add(row.addresseeId);
      if (row.addresseeId === userId) ids.add(row.requesterId);
    }
    const board = [...ids]
      .map((id) => {
        const person = ensure(id);
        return {
          displayName: person.displayName,
          level: person.snapshot?.level ?? 1,
          weeklyXp: person.snapshot?.weeklyXp ?? 0,
          streak: person.snapshot?.currentStreak ?? 0,
          you: id === userId,
        };
      })
      .sort((a, b) => b.weeklyXp - a.weeklyXp || b.streak - a.streak || a.displayName.localeCompare(b.displayName));
    const requests = friendships
      .filter((row) => row.status === "pending" && (row.requesterId === userId || row.addresseeId === userId))
      .map((row) => ({
        id: row.id,
        displayName: ensure(row.requesterId === userId ? row.addresseeId : row.requesterId).displayName,
        direction: row.addresseeId === userId ? ("in" as const) : ("out" as const),
      }));
    return { friendCode: profile.friendCode, displayName: profile.displayName, board, requests };
  }

  return {
    setHistory(userId, history) {
      histories.set(userId, history);
    },
    setCode(userId, code, displayName) {
      profiles.set(userId, { displayName, friendCode: normalizeFriendCode(code), snapshot: profiles.get(userId)?.snapshot ?? null });
    },
    async load(userId) {
      return histories.get(userId) ?? EMPTY_HISTORY;
    },
    async save(userId, snapshot) {
      const profile = ensure(userId);
      profile.snapshot = snapshot;
    },
    async social(userId) {
      return social(userId);
    },
    async rename(userId, displayName) {
      const cleaned = displayName.trim().replace(/\s+/g, " ").replace(/[^a-zA-Z0-9 ]/g, "");
      if (cleaned.length < 2 || cleaned.length > 24) {
        return { ok: false, message: "Use 2 to 24 letters, numbers, or spaces." };
      }
      ensure(userId).displayName = cleaned;
      return { ok: true, displayName: cleaned };
    },
    async requestFriend(userId, code) {
      const normalized = normalizeFriendCode(code);
      const target = [...profiles.entries()].find(([, profile]) => profile.friendCode === normalized);
      if (!target) return { ok: false, message: "No one has that friend code." };
      const applied = applyFriendRequest(friendships, userId, target[0], `fr-${nextId}`);
      if (applied.status === "self") return { ok: false, message: "That is your own code." };
      if (applied.records.length !== friendships.length) nextId += 1;
      friendships = applied.records;
      return { ok: true, status: applied.status === "already" ? "accepted" : applied.status };
    },
    async respond(userId, friendshipId, accept) {
      const applied = respondToFriend(friendships, userId, friendshipId, accept);
      if (!applied.ok) return { ok: false, message: "That request is not waiting on you." };
      friendships = applied.records;
      return { ok: true };
    },
  };
}

type MealRow = {
  id?: string;
  logged_at?: string;
  meal_type?: string;
  photo_path?: string | null;
  items?: unknown;
  confidence?: string;
  notes?: string | null;
  excluded?: unknown;
  source?: string;
  log_kind?: string | null;
};

export function mealFromRewardRow(row: MealRow): LoggedMeal | null {
  const parsed = loggedMealSchema.safeParse({
    id: row.id,
    loggedAt: row.logged_at,
    photoUri: row.photo_path ?? null,
    mealType: row.meal_type,
    items: row.items,
    confidence: row.confidence,
    notes: row.notes ?? "",
    excluded: row.excluded ?? [],
    source: row.source,
    ...(row.log_kind && LOG_KINDS.has(row.log_kind) ? { logKind: row.log_kind } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function createSupabaseRewardStore(
  env: { url: string; serviceKey: string },
  fetchImpl: typeof fetch = fetch,
): RewardStore {
  const base = env.url.replace(/\/$/, "");

  async function rpc(name: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: env.serviceKey,
          Authorization: `Bearer ${env.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("rewards");
    }
    const text = await response.text();
    if (response.status === 404 || /PGRST202|PGRST205|schema cache|replace_reward_state|reward_profiles/i.test(text)) {
      throw new RewardsNotReady();
    }
    if (!response.ok) throw new Error("rewards");
    if (!text) return null;
    return JSON.parse(text) as unknown;
  }

  async function rest(path: string): Promise<unknown> {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      if (/log_kind/i.test(text)) throw new RewardsNotReady();
      throw new Error("rewards");
    }
    return text ? (JSON.parse(text) as unknown) : [];
  }

  function asSocial(value: unknown): RewardSocial {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const board = Array.isArray(record.board) ? record.board.flatMap(boardEntry) : [];
    const requests = Array.isArray(record.requests) ? record.requests.flatMap(requestEntry) : [];
    return {
      friendCode: typeof record.friendCode === "string" ? record.friendCode : "",
      displayName: typeof record.displayName === "string" ? record.displayName : "Friend",
      board,
      requests,
    };
  }

  return {
    async load(userId) {
      const user = encodeURIComponent(userId);
      let mealRows: unknown;
      try {
        mealRows = await rest(
          `meals?user_id=eq.${user}&select=id,logged_at,meal_type,photo_path,items,confidence,notes,excluded,source,log_kind`,
        );
      } catch (error) {
        if (!(error instanceof RewardsNotReady)) throw error;
        mealRows = await rest(`meals?user_id=eq.${user}&select=id,logged_at,meal_type,photo_path,items,confidence,notes,excluded,source`);
      }
      const meals = (Array.isArray(mealRows) ? mealRows : []).flatMap((row) => {
        const meal = mealFromRewardRow(row as MealRow);
        return meal ? [meal] : [];
      });
      let recipes: RewardHistory["recipes"] = [];
      try {
        const recipeRows = await rest(`recipes?user_id=eq.${user}&select=id,created_at`);
        recipes = (Array.isArray(recipeRows) ? recipeRows : []).flatMap((row) => {
          const record = row as { id?: unknown; created_at?: unknown };
          return typeof record.id === "string" && typeof record.created_at === "string"
            ? [{ id: record.id, createdAt: record.created_at }]
            : [];
        });
      } catch {
        recipes = [];
      }
      let targets = EMPTY_HISTORY.targets;
      try {
        const prefRows = await rest(`preferences?user_id=eq.${user}&select=calorie_goal,protein_goal,goal_window_percent`);
        const pref = (Array.isArray(prefRows) ? prefRows[0] : null) as
          | { calorie_goal?: number | null; protein_goal?: number | null; goal_window_percent?: number | null }
          | undefined;
        const window = pref?.goal_window_percent;
        targets = {
          calorieGoal: typeof pref?.calorie_goal === "number" ? pref.calorie_goal : null,
          proteinGoal: typeof pref?.protein_goal === "number" ? pref.protein_goal : null,
          windowPercent: window === 5 || window === 10 || window === 15 || window === 20 ? window : 10,
        };
      } catch {
        targets = EMPTY_HISTORY.targets;
      }
      return { meals, recipes, targets };
    },
    async save(userId, snapshot) {
      await rpc("replace_reward_state", {
        p_user: userId,
        p_state: {
          level: snapshot.level,
          currentStreak: snapshot.currentStreak,
          bestStreak: snapshot.bestStreak,
          freezes: snapshot.freezes,
          weekKey: snapshot.weekKey,
          events: snapshot.events,
          badges: snapshot.badges.filter((badge) => badge.earned).map((badge) => badge.id),
          challenges: snapshot.challenges.map((challenge) => ({
            id: challenge.id,
            progress: challenge.progress,
            target: challenge.target,
            completed: challenge.completed,
          })),
        },
      });
    },
    async social(userId) {
      return asSocial(await rpc("reward_social_for", { p_user: userId }));
    },
    async rename(userId, displayName) {
      return actionResult(await rpc("set_display_name_for", { p_user: userId, p_name: displayName }));
    },
    async requestFriend(userId, code) {
      return actionResult(await rpc("request_friend_for", { p_user: userId, p_code: code }));
    },
    async respond(userId, friendshipId, accept) {
      return actionResult(await rpc("respond_friend_for", { p_user: userId, p_id: friendshipId, p_accept: accept }));
    },
  };
}

function boardEntry(value: unknown): FriendBoardEntry[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.displayName !== "string" || typeof record.level !== "number") return [];
  return [
    {
      displayName: record.displayName,
      level: record.level,
      weeklyXp: typeof record.weeklyXp === "number" ? record.weeklyXp : 0,
      streak: typeof record.streak === "number" ? record.streak : 0,
      you: record.you === true,
    },
  ];
}

function requestEntry(value: unknown): FriendRequestRow[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.displayName !== "string") return [];
  if (record.direction !== "in" && record.direction !== "out") return [];
  return [{ id: record.id, displayName: record.displayName, direction: record.direction }];
}

function actionResult(value: unknown): RewardActionResult {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (record.ok === true) {
    return {
      ok: true,
      status: typeof record.status === "string" ? record.status : undefined,
      displayName: typeof record.displayName === "string" ? record.displayName : undefined,
    };
  }
  return { ok: false, message: typeof record.message === "string" ? record.message : "That didn't work." };
}

export function rewardPayload(snapshot: RewardSnapshot, social: RewardSocial) {
  return {
    rewards: toRewardView(snapshot),
    friendCode: social.friendCode,
    displayName: social.displayName,
    board: social.board.map((entry) => ({
      displayName: entry.displayName,
      level: entry.level,
      weeklyXp: entry.weeklyXp,
      streak: entry.streak,
      you: entry.you,
    })),
    requests: social.requests.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      direction: entry.direction,
    })),
  };
}

export async function syncRewardUser(store: RewardStore, userId: string, now = new Date()): Promise<RewardSnapshot> {
  const history = await store.load(userId);
  const snapshot = evaluateRewards({ ...history, now });
  await store.save(userId, snapshot);
  return snapshot;
}
