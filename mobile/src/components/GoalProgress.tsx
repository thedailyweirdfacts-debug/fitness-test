import { StyleSheet, Text, View } from "react-native";
import { progressCopy, type DayGoalStatus } from "../../../shared/src";
import { formatAmount } from "./ui";
import { colors } from "../theme";

export function GoalProgress({
  status,
  currentStreak,
  bestStreak,
}: {
  status: DayGoalStatus;
  currentStreak: number;
  bestStreak: number;
}) {
  if (status.calorieGoal == null || status.low == null || status.high == null) return null;
  const scale = Math.max(status.high, status.calories, 1);
  const fill = Math.min(1, status.calories / scale);
  const bandLeft = status.low / scale;
  const bandWidth = Math.max(0, (status.high - status.low) / scale);
  const streak =
    currentStreak > 0
      ? `${currentStreak} day streak · best ${bestStreak}`
      : bestStreak > 0
        ? `Best streak is ${bestStreak} days`
        : "A streak starts when a day lands in the window";

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.band, { left: `${bandLeft * 100}%`, width: `${bandWidth * 100}%` }]} />
        <View style={[styles.fill, { width: `${fill * 100}%` }, status.hit && styles.fillHit]} />
      </View>
      <Text style={styles.copy}>{progressCopy(status)}</Text>
      <Text style={styles.streak}>{streak}</Text>
      {status.proteinGoal != null ? (
        <Text style={styles.protein}>
          Protein {formatAmount(status.protein)} / {formatAmount(status.proteinGoal)} g
          {status.proteinMet ? " · covered" : ""}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  track: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: "hidden",
    position: "relative",
  },
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: colors.greenSoft,
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.calorie,
    borderRadius: 999,
  },
  fillHit: {
    backgroundColor: colors.green,
  },
  copy: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
  },
  streak: {
    color: colors.greenDark,
    fontSize: 13,
    fontWeight: "700",
  },
  protein: {
    color: colors.protein,
    fontSize: 13,
    fontWeight: "700",
  },
});
