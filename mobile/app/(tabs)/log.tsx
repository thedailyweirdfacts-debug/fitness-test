import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, buildRewardReport, dailyTotals, dayKeyFromDate, formatDayLabel } from "../../../shared/src";
import { GoalProgress } from "../../src/components/GoalProgress";
import { MealGroups } from "../../src/components/MealGroups";
import { MacroLine, PlateArt } from "../../src/components/ui";
import { confirm } from "../../src/lib/confirm";
import { draftFromMeal } from "../../src/lib/draft";
import { useApp } from "../../src/state/AppContext";
import { colors, displayFont } from "../../src/theme";

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { meals, settings, openDraft, deleteMeal, updateMealType } = useApp();
  const today = dayKeyFromDate(new Date());
  const [day, setDay] = useState(today);
  const totals = dailyTotals(meals, day);
  const report = buildRewardReport(
    meals,
    {
      calorieGoal: settings.calorieGoal,
      proteinGoal: settings.proteinGoal,
      windowPercent: settings.goalWindowPercent,
    },
    today,
  );
  const dayMeals = meals.filter((meal) => dayKeyFromDate(new Date(meal.loggedAt)) === day);

  async function remove(id: string) {
    const ok = await confirm("Remove this meal?", "It will leave that day's total.");
    if (ok) await deleteMeal(id);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
      <Text style={styles.wordmark}>Log</Text>
      <View style={styles.dayRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => setDay(addDays(day, -1))} style={styles.chevron}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.dayLabel}>
          <Text style={styles.dayTitle}>{formatDayLabel(day, today)}</Text>
          <Text style={styles.dayDate}>{prettyDate(day)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          disabled={day === today}
          onPress={() => setDay(addDays(day, 1))}
          style={[styles.chevron, day === today && styles.chevronOff]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.kicker}>Running total</Text>
        <View style={styles.totalNumber}>
          <Text style={styles.calories}>{totals.calories}</Text>
          <Text style={styles.unit}>kcal</Text>
        </View>
        <MacroLine totals={totals} />
        {day === today && settings.calorieGoal != null ? (
          <GoalProgress status={report.today} currentStreak={report.currentStreak} bestStreak={report.bestStreak} />
        ) : null}
      </View>

      {dayMeals.length === 0 ? (
        <View style={styles.empty}>
          <PlateArt kind="empty" />
          <Text style={styles.emptyTitle}>No meals this day</Text>
          <Text style={styles.emptyCopy}>A saved plate will land here, grouped as breakfast, lunch, dinner, or a snack.</Text>
        </View>
      ) : (
        <MealGroups
          meals={dayMeals}
          onOpen={(meal) => {
            openDraft(draftFromMeal(meal));
            router.push("/results");
          }}
          onDelete={(meal) => void remove(meal.id)}
          onChangeType={(meal, type) => void updateMealType(meal.id, type)}
        />
      )}
      {day !== today ? (
        <Pressable accessibilityRole="button" onPress={() => setDay(today)} style={styles.jump}>
          <Text style={styles.jumpText}>Back to today</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function prettyDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 14,
  },
  wordmark: {
    ...displayFont,
    fontSize: 36,
    color: colors.ink,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chevron: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronOff: {
    opacity: 0.35,
  },
  dayLabel: {
    flex: 1,
  },
  dayTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  dayDate: {
    color: colors.muted,
    fontSize: 13,
  },
  totalCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  totalNumber: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  calories: {
    ...displayFont,
    fontSize: 48,
    lineHeight: 52,
    color: colors.ink,
  },
  unit: {
    color: colors.calorie,
    fontWeight: "700",
    marginBottom: 8,
  },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  emptyCopy: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  jump: {
    alignItems: "center",
    paddingVertical: 8,
  },
  jumpText: {
    color: colors.greenDark,
    fontWeight: "700",
  },
});
