import { Pressable, StyleSheet, Text, View } from "react-native";
import { MEAL_TYPES, mealTypeLabel, type MealType } from "../../../shared/src";
import { colors } from "../theme";

export function MealTypePicker({ value, onChange }: { value: MealType; onChange: (type: MealType) => void }) {
  return (
    <View style={styles.row}>
      {MEAL_TYPES.map((type) => {
        const selected = type === value;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={mealTypeLabel(type)}
            accessibilityState={{ selected }}
            onPress={() => onChange(type)}
            style={[styles.chip, selected && styles.chipOn]}
          >
            <Text style={[styles.label, selected && styles.labelOn]}>{mealTypeLabel(type)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  label: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 13,
  },
  labelOn: {
    color: colors.white,
  },
});
