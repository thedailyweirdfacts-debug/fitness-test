import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { presentItem, withGrams, withScale, type FoodItem } from "../../../shared/src";
import { colors } from "../theme";
import { formatAmount } from "./ui";

export function FoodCard({
  item,
  onChange,
  onRemove,
}: {
  item: FoodItem;
  onChange: (item: FoodItem) => void;
  onRemove: () => void;
}) {
  const view = presentItem(item);
  const [gramsText, setGramsText] = useState(String(view.grams));
  const editingGrams = useRef(false);

  useEffect(() => {
    if (!editingGrams.current) setGramsText(String(view.grams));
  }, [view.grams]);

  const canShrink = item.scale > 0.25;
  const canGrow = item.scale < 8;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <TextInput
          value={item.name}
          onChangeText={(name) => onChange({ ...item, name })}
          style={styles.name}
          placeholder="Food name"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Food name"
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
      <Text style={styles.portion}>{view.portionText}</Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Smaller portion"
          disabled={!canShrink}
          onPress={() => onChange(withScale(item, item.scale - 0.25))}
          style={[styles.step, !canShrink && styles.stepOff]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <View style={styles.gramsWrap}>
          <TextInput
            value={gramsText}
            onFocus={() => {
              editingGrams.current = true;
            }}
            onBlur={() => {
              editingGrams.current = false;
              const parsed = Number(gramsText);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                setGramsText(String(view.grams));
                return;
              }
              onChange(withGrams(item, parsed));
            }}
            onChangeText={(text) => setGramsText(text.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            style={styles.grams}
            accessibilityLabel="Portion in grams"
          />
          <Text style={styles.gramsUnit}>g</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Larger portion"
          disabled={!canGrow}
          onPress={() => onChange(withScale(item, item.scale + 0.25))}
          style={[styles.step, !canGrow && styles.stepOff]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.macros}>
        <Text style={[styles.kcal, { color: colors.calorie }]}>{view.calories} kcal</Text>
        <Text style={styles.macro}>P {formatAmount(view.protein)}</Text>
        <Text style={styles.macro}>C {formatAmount(view.carbs)}</Text>
        <Text style={styles.macro}>F {formatAmount(view.fat)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  name: {
    flex: 1,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    padding: 0,
  },
  remove: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  portion: {
    color: colors.muted,
    fontSize: 14,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  step: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepOff: {
    opacity: 0.35,
  },
  stepText: {
    color: colors.greenDark,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "600",
  },
  gramsWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.bg,
  },
  grams: {
    minWidth: 48,
    textAlign: "right",
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    padding: 0,
  },
  gramsUnit: {
    color: colors.muted,
    fontSize: 15,
  },
  macros: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  kcal: {
    fontSize: 15,
    fontWeight: "700",
    marginRight: "auto",
  },
  macro: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
});
