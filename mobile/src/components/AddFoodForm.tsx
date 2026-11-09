import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createManualItem, type FoodItem } from "../../../shared/src";
import { colors } from "../theme";

const EMPTY = { name: "", portion: "", grams: "", calories: "", protein: "", carbs: "", fat: "" };

export function AddFoodForm({ onAdd }: { onAdd: (item: FoodItem) => void }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof EMPTY, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    const grams = Number(fields.grams);
    const calories = Number(fields.calories || 0);
    const protein = Number(fields.protein || 0);
    const carbs = Number(fields.carbs || 0);
    const fat = Number(fields.fat || 0);
    if (!fields.name.trim()) {
      setError("Name the food first.");
      return;
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      setError("Enter a portion in grams.");
      return;
    }
    if ([calories, protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Calories and macros need to be zero or more.");
      return;
    }
    onAdd(
      createManualItem({
        name: fields.name,
        portionLabel: fields.portion,
        grams,
        calories,
        protein,
        carbs,
        fat,
      }),
    );
    setFields(EMPTY);
    setError(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Add a food" onPress={() => setOpen(true)} style={styles.collapsed}>
        <Text style={styles.collapsedText}>Add something the estimate missed</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.heading}>Add a food</Text>
      <Field label="Name" value={fields.name} onChangeText={(value) => set("name", value)} placeholder="Garlic bread" />
      <Field label="Portion" value={fields.portion} onChangeText={(value) => set("portion", value)} placeholder="1 slice" />
      <View style={styles.grid}>
        <Field label="Grams" value={fields.grams} onChangeText={(value) => set("grams", value)} keyboard="decimal-pad" />
        <Field label="Calories" value={fields.calories} onChangeText={(value) => set("calories", value)} keyboard="decimal-pad" />
      </View>
      <View style={styles.grid}>
        <Field label="Protein" value={fields.protein} onChangeText={(value) => set("protein", value)} keyboard="decimal-pad" />
        <Field label="Carbs" value={fields.carbs} onChangeText={(value) => set("carbs", value)} keyboard="decimal-pad" />
        <Field label="Fat" value={fields.fat} onChangeText={(value) => set("fat", value)} keyboard="decimal-pad" />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add food" onPress={submit} style={styles.add}>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboard = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboard?: "default" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        keyboardType={keyboard}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  collapsedText: {
    color: colors.greenDark,
    fontWeight: "700",
    fontSize: 15,
  },
  form: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  heading: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  field: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 16,
  },
  grid: {
    flexDirection: "row",
    gap: 10,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancel: {
    minHeight: 42,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  cancelText: {
    color: colors.muted,
    fontWeight: "700",
  },
  add: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.green,
    justifyContent: "center",
  },
  addText: {
    color: colors.white,
    fontWeight: "700",
  },
});
