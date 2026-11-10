import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { markRewardsSeen, quotaDayKey, type RewardBadge } from "../../../shared/src";
import { useApp } from "../state/AppContext";
import { useRewardsModel } from "../state/useRewards";
import { Celebration } from "./Celebration";

const LEVEL_KEY = "@plateful/level";

type Moment =
  | { kind: "level"; level: number; title: string }
  | { kind: "goal"; badges: RewardBadge[] }
  | { kind: "badges"; badges: RewardBadge[] };

export function RewardHost() {
  const { ready, seenRewards, saveSeenRewards } = useApp();
  const { rewards } = useRewardsModel();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [levelSeen, setLevelSeen] = useState<number | null>(null);
  const today = quotaDayKey(new Date());

  useEffect(() => {
    AsyncStorage.getItem(LEVEL_KEY)
      .then((raw) => {
        const parsed = Number(raw);
        setLevelSeen(Number.isInteger(parsed) && parsed > 0 ? parsed : 0);
      })
      .catch(() => setLevelSeen(0));
  }, []);

  useEffect(() => {
    if (!ready || levelSeen == null || moment) return;
    if (levelSeen === 0) {
      void AsyncStorage.setItem(LEVEL_KEY, String(rewards.level));
      setLevelSeen(rewards.level);
      return;
    }
    if (rewards.level > levelSeen) {
      setMoment({ kind: "level", level: rewards.level, title: rewards.title });
      return;
    }
    const unseen = rewards.badges.filter((badge) => badge.earned && !seenRewards.badges.includes(badge.id));
    const goal = rewards.todayHit && !seenRewards.goalDays.includes(today);
    if (goal) {
      setMoment({ kind: "goal", badges: unseen });
      return;
    }
    if (unseen.length > 0) setMoment({ kind: "badges", badges: unseen });
  }, [ready, levelSeen, moment, rewards, seenRewards, today]);

  useEffect(() => {
    if (!moment || Platform.OS === "web") return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [moment]);

  async function dismiss() {
    if (!moment) return;
    if (moment.kind === "level") {
      await AsyncStorage.setItem(LEVEL_KEY, String(moment.level));
      setLevelSeen(moment.level);
      setMoment(null);
      return;
    }
    const next = markRewardsSeen(
      seenRewards,
      {
        badges: moment.badges.map((badge) => ({ ...badge, earned: true })),
        goalDay: moment.kind === "goal",
      },
      today,
    );
    setMoment(null);
    await saveSeenRewards(next);
  }

  if (!moment) return null;
  if (moment.kind === "level") {
    return (
      <Celebration
        tone="level"
        title={String(moment.level)}
        lines={[moment.title, "That XP is yours. Keep logging and the next title gets closer."]}
        onDone={() => void dismiss()}
      />
    );
  }
  if (moment.kind === "goal") {
    const extra = moment.badges.slice(0, 3).map((badge) => `${badge.title}. ${badge.detail}`);
    const more = moment.badges.length > 3 ? [`And ${moment.badges.length - 3} more on the Badges screen.`] : [];
    return (
      <Celebration
        tone="goal"
        title="In the window"
        lines={["Today landed near your calorie goal.", ...extra, ...more]}
        onDone={() => void dismiss()}
      />
    );
  }
  const lines =
    moment.badges.length === 1
      ? [moment.badges[0]!.detail]
      : [
          ...moment.badges.slice(0, 4).map((badge) => `${badge.title}. ${badge.detail}`),
          ...(moment.badges.length > 4 ? [`And ${moment.badges.length - 4} more on the Badges screen.`] : []),
        ];
  return (
    <Celebration
      tone="badge"
      title={moment.badges.length === 1 ? moment.badges[0]!.title : "New badges"}
      lines={lines}
      onDone={() => void dismiss()}
    />
  );
}
