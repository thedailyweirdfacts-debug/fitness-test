import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  buildRewardReport,
  dayKeyFromDate,
  freshRewards,
  markRewardsSeen,
  type FreshRewards,
  type SeenRewards,
} from "../../../shared/src";
import { useApp } from "../state/AppContext";
import { Celebration } from "./Celebration";

const REWARDS_KEY = "@plateful/rewards";
const EMPTY: SeenRewards = { badges: [], goalDays: [] };

function readSeen(raw: string | null): SeenRewards {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as { badges?: unknown; goalDays?: unknown };
    return {
      badges: Array.isArray(parsed.badges) ? parsed.badges.filter((id): id is string => typeof id === "string") : [],
      goalDays: Array.isArray(parsed.goalDays) ? parsed.goalDays.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return EMPTY;
  }
}

export function RewardHost() {
  const { ready, meals, settings } = useApp();
  const seenRef = useRef<SeenRewards | null>(null);
  const [fresh, setFresh] = useState<FreshRewards | null>(null);
  const today = dayKeyFromDate(new Date());

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if (!seenRef.current) {
        seenRef.current = readSeen(await AsyncStorage.getItem(REWARDS_KEY));
      }
      if (cancelled || !seenRef.current) return;
      const report = buildRewardReport(
        meals,
        {
          calorieGoal: settings.calorieGoal,
          proteinGoal: settings.proteinGoal,
          windowPercent: settings.goalWindowPercent,
        },
        today,
      );
      const next = freshRewards(report, seenRef.current, today);
      if (next.badges.length > 0 || next.goalDay) setFresh(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, meals, settings, today]);

  async function dismiss() {
    if (!fresh || !seenRef.current) {
      setFresh(null);
      return;
    }
    const next = markRewardsSeen(seenRef.current, fresh, today);
    seenRef.current = next;
    setFresh(null);
    await AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(next));
  }

  if (!fresh) return null;
  const title = fresh.goalDay ? "In the window" : "New badge";
  const lines = [
    ...(fresh.goalDay ? ["Today landed near your calorie goal."] : []),
    ...fresh.badges.map((badge) => `${badge.title}. ${badge.detail}`),
  ];
  return <Celebration title={title} lines={lines} onDone={() => void dismiss()} />;
}
