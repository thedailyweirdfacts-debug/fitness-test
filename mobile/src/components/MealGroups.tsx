import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { groupMealsByType, mealTypeLabel, presentMeal, type LoggedMeal, type MealType } from "../../../shared/src";
import { colors } from "../theme";
import { MealTypePicker } from "./MealTypePicker";

export function MealGroups({
  meals,
  onOpen,
  onDelete,
  onChangeType,
}: {
  meals: LoggedMeal[];
  onOpen: (meal: LoggedMeal) => void;
  onDelete: (meal: LoggedMeal) => void;
  onChangeType: (meal: LoggedMeal, type: MealType) => void;
}) {
  const [changing, setChanging] = useState<string | null>(null);
  const groups = groupMealsByType(meals);
  if (groups.length === 0) return null;

  return (
    <View style={styles.groups}>
      {groups.map((group) => (
        <View key={group.type} style={styles.group}>
          <Text style={styles.groupTitle}>{mealTypeLabel(group.type)}</Text>
          {group.meals.map((meal) => {
            const view = presentMeal(meal.items);
            const names = view.items.map((item) => item.name).join(", ");
            return (
              <View key={meal.id} style={styles.meal}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${names}`}
                  onPress={() => onOpen(meal)}
                  style={styles.mealMain}
                >
                  <MealThumb uri={meal.photoUri} />
                  <View style={styles.mealText}>
                    <Text style={styles.mealTime}>{formatTime(meal.loggedAt)}</Text>
                    <Text style={styles.mealNames} numberOfLines={2}>
                      {names}
                    </Text>
                    {meal.source !== "vision" ? (
                      <Text style={styles.sampleTag}>{meal.source === "sample" ? "Saved sample" : "Demo estimate"}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.mealKcal}>{view.totals.calories}</Text>
                </Pressable>
                {changing === meal.id ? (
                  <View style={styles.typeEdit}>
                    <MealTypePicker value={meal.mealType} onChange={(type) => onChangeType(meal, type)} />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Change ${mealTypeLabel(meal.mealType)}`}
                    onPress={() => setChanging(meal.id)}
                    style={styles.change}
                  >
                    <Text style={styles.changeText}>Change type</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Remove meal" onPress={() => onDelete(meal)} style={styles.remove}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function MealThumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return <Image source={{ uri }} style={styles.thumb} onError={() => setFailed(true)} />;
  }
  return (
    <View style={styles.thumbFallback}>
      <Text style={styles.thumbMark}>Plate</Text>
    </View>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  groups: {
    gap: 16,
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  meal: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  mealMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.line,
  },
  thumbFallback: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbMark: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: "800",
  },
  mealText: {
    flex: 1,
    gap: 2,
  },
  mealTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  mealNames: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  sampleTag: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: "600",
  },
  mealKcal: {
    color: colors.calorie,
    fontWeight: "800",
    fontSize: 16,
  },
  typeEdit: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  change: {
    alignItems: "center",
    paddingBottom: 8,
  },
  changeText: {
    color: colors.greenDark,
    fontWeight: "700",
    fontSize: 13,
  },
  remove: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "center",
    paddingVertical: 10,
  },
  removeText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 13,
  },
});
