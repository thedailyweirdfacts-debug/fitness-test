import { useEffect, useState } from "react";
import {
  buildRewardReport,
  dayKeyFromDate,
  freshRewards,
  markRewardsSeen,
  type FreshRewards,
} from "../../../shared/src";
import { useApp } from "../state/AppContext";
import { Celebration } from "./Celebration";

export function RewardHost() {
  const { ready, meals, settings, seenRewards, saveSeenRewards } = useApp();
  const [fresh, setFresh] = useState<FreshRewards | null>(null);
  const today = dayKeyFromDate(new Date());

  useEffect(() => {
    if (!ready) return;
    const report = buildRewardReport(
      meals,
      {
        calorieGoal: settings.calorieGoal,
        proteinGoal: settings.proteinGoal,
        windowPercent: settings.goalWindowPercent,
      },
      today,
    );
    const next = freshRewards(report, seenRewards, today);
    if (next.badges.length > 0 || next.goalDay) setFresh(next);
  }, [ready, meals, settings, seenRewards, today]);

  async function dismiss() {
    if (!fresh) {
      setFresh(null);
      return;
    }
    const next = markRewardsSeen(seenRewards, fresh, today);
    setFresh(null);
    await saveSeenRewards(next);
  }

  if (!fresh) return null;
  const title = fresh.goalDay ? "In the window" : "New badge";
  const lines = [
    ...(fresh.goalDay ? ["Today landed near your calorie goal."] : []),
    ...fresh.badges.map((badge) => `${badge.title}. ${badge.detail}`),
  ];
  return <Celebration title={title} lines={lines} onDone={() => void dismiss()} />;
}
