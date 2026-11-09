import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildRewardReport, dailyTotals, dayKeyFromDate, formatDayLabel, mealsForDay } from "../../../shared/src";
import { MealGroups } from "../../src/components/MealGroups";
import { MacroLine, PlateArt } from "../../src/components/ui";
import { confirm } from "../../src/lib/confirm";
import { draftFromMeal } from "../../src/lib/draft";
import { useApp } from "../../src/state/AppContext";
import { colors, displayFont } from "../../src/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { meals, settings, openDraft, deleteMeal, updateMealType } = useApp();
  const today = dayKeyFromDate(new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const logged = useMemo(() => {
    const days = new Set<string>();
    for (const meal of meals) days.add(dayKeyFromDate(new Date(meal.loggedAt)));
    return days;
  }, [meals]);
  const report = buildRewardReport(
    meals,
    {
      calorieGoal: settings.calorieGoal,
      proteinGoal: settings.proteinGoal,
      windowPercent: settings.goalWindowPercent,
    },
    today,
  );
  const hits = new Set(report.hitDays);
  const visible = mealsForDay(meals, selected);
  const totals = dailyTotals(meals, selected);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const viewingCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();
  const earned = report.badges.filter((badge) => badge.earned);

  function openMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setCursor(next);
  }

  async function remove(id: string) {
    const ok = await confirm("Remove this meal?", "It will leave that day's total.");
    if (ok) await deleteMeal(id);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
      <Text style={styles.wordmark}>History</Text>
      <Text style={styles.lead}>Every saved meal stays on this phone. Tap a day, then a plate.</Text>

      <View style={styles.calendar}>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => openMonth(-1)} style={styles.chevron}>
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </Pressable>
          <Text style={styles.month}>{monthLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            disabled={viewingCurrentMonth}
            onPress={() => openMonth(1)}
            style={[styles.chevron, viewingCurrentMonth && styles.chevronOff]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.weekdays}>
          {WEEKDAYS.map((label, index) => (
            <Text key={`${label}-${index}`} style={styles.weekday}>
              {label}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week.join("-")} style={styles.week}>
            {week.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.cell} />;
              const future = day > today;
              const chosen = day === selected;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={formatDayLabel(day, today)}
                  accessibilityState={{ selected: chosen, disabled: future }}
                  disabled={future}
                  onPress={() => setSelected(day)}
                  style={[styles.cell, chosen && styles.cellOn, future && styles.cellOff]}
                >
                  <Text style={[styles.cellText, chosen && styles.cellTextOn]}>{Number(day.slice(-2))}</Text>
                  {logged.has(day) ? <View style={[styles.dot, hits.has(day) && styles.dotHit, chosen && styles.dotOn]} /> : <View style={styles.dotSpacer} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.dayCard}>
        <Text style={styles.kicker}>{formatDayLabel(selected, today)}</Text>
        <View style={styles.totalNumber}>
          <Text style={styles.calories}>{totals.calories}</Text>
          <Text style={styles.unit}>kcal</Text>
        </View>
        <MacroLine totals={totals} />
        {hits.has(selected) ? <Text style={styles.hit}>In the calorie window</Text> : null}
      </View>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <PlateArt kind="empty" />
          <Text style={styles.emptyTitle}>Nothing saved this day</Text>
          <Text style={styles.emptyCopy}>Days with a plate show a dot on the calendar.</Text>
        </View>
      ) : (
        <MealGroups
          meals={visible}
          onOpen={(meal) => {
            openDraft(draftFromMeal(meal));
            router.push("/results");
          }}
          onDelete={(meal) => void remove(meal.id)}
          onChangeType={(meal, type) => void updateMealType(meal.id, type)}
        />
      )}

      <View style={styles.badges}>
        <Text style={styles.kicker}>Badges</Text>
        {earned.length === 0 ? (
          <Text style={styles.badgeEmpty}>Badges show up as you log meals and land near a goal. Nothing is lost if you skip a day.</Text>
        ) : (
          earned.map((badge) => (
            <View key={badge.id} style={styles.badge}>
              <Text style={styles.badgeTitle}>{badge.title}</Text>
              <Text style={styles.badgeDetail}>{badge.detail}</Text>
            </View>
          ))
        )}
        {settings.calorieGoal != null ? (
          <Text style={styles.streak}>
            {report.currentStreak > 0 ? `${report.currentStreak} day streak` : "No streak yet"} · best {report.bestStreak}
          </Text>
        ) : (
          <Text style={styles.badgeEmpty}>Set a calorie goal in Settings when you want streaks.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: first.getDay() }, () => null);
  for (let date = 1; date <= count; date += 1) cells.push(dayKeyFromDate(new Date(year, month, date)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
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
  lead: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  calendar: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  month: {
    flex: 1,
    textAlign: "center",
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
  },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronOff: {
    opacity: 0.35,
  },
  weekdays: {
    flexDirection: "row",
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: colors.faint,
    fontSize: 12,
    fontWeight: "700",
  },
  week: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 12,
    gap: 3,
  },
  cellOn: {
    backgroundColor: colors.green,
  },
  cellOff: {
    opacity: 0.35,
  },
  cellText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 14,
  },
  cellTextOn: {
    color: colors.white,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.calorie,
  },
  dotHit: {
    backgroundColor: colors.green,
  },
  dotOn: {
    backgroundColor: colors.white,
  },
  dotSpacer: {
    width: 5,
    height: 5,
  },
  dayCard: {
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
    fontSize: 40,
    lineHeight: 44,
    color: colors.ink,
  },
  unit: {
    color: colors.calorie,
    fontWeight: "700",
    marginBottom: 6,
  },
  hit: {
    color: colors.greenDark,
    fontWeight: "800",
  },
  empty: {
    alignItems: "center",
    gap: 8,
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
  badges: {
    gap: 8,
  },
  badge: {
    backgroundColor: colors.greenSoft,
    borderRadius: 16,
    padding: 12,
    gap: 2,
  },
  badgeTitle: {
    color: colors.greenDark,
    fontWeight: "800",
  },
  badgeDetail: {
    color: colors.greenDark,
    lineHeight: 18,
  },
  badgeEmpty: {
    color: colors.muted,
    lineHeight: 20,
  },
  streak: {
    color: colors.ink,
    fontWeight: "700",
  },
});
