import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mealTypeLabel, presentMeal, sampleTitle, type FoodItem, type MealType } from "../../shared/src";
import { AddFoodForm } from "../src/components/AddFoodForm";
import { FoodCard } from "../src/components/FoodCard";
import { MealTypePicker } from "../src/components/MealTypePicker";
import { confidenceCopy, MacroLine, PlateArt, PrimaryButton } from "../src/components/ui";
import { confirm } from "../src/lib/confirm";
import { useApp } from "../src/state/AppContext";
import { colors, displayFont } from "../src/theme";

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, saveDraft, deleteMeal } = useApp();
  const [items, setItems] = useState<FoodItem[]>(draft?.items ?? []);
  const [mealType, setMealType] = useState<MealType>(draft?.mealType ?? "snack");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (!draft) {
      router.replace("/");
      return;
    }
    if (seen.current !== draft.key) {
      seen.current = draft.key;
      setItems(draft.items);
      setMealType(draft.mealType);
      setError(null);
      setPhotoFailed(false);
    }
  }, [draft, router]);

  if (!draft) return <View style={styles.screen} />;

  const current = draft;
  const view = presentMeal(items);
  const sampleName = current.sampleId ? sampleTitle(current.sampleId) : "a saved example";
  const editing = current.editingId !== null;

  async function save() {
    if (items.length === 0) {
      setError("Add at least one food before saving.");
      return;
    }
    if (items.some((item) => item.name.trim().length === 0)) {
      setError("Give every food a name before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveDraft({ ...current, items, mealType });
      router.replace("/(tabs)/log");
    } catch {
      setError("Couldn't save this meal on the device.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSaved() {
    if (!current.editingId) return;
    const ok = await confirm("Remove this meal?", "It will leave the day's running total.");
    if (!ok) return;
    await deleteMeal(current.editingId);
    router.replace("/(tabs)/log");
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.screenTitle}>{editing ? "Edit meal" : "Your plate"}</Text>
        </View>

        <View style={styles.hero}>
          {current.photoUri && !photoFailed ? (
            <Image source={{ uri: current.photoUri }} style={styles.photo} onError={() => setPhotoFailed(true)} />
          ) : (
            <PlateArt kind={current.sampleId ?? "empty"} />
          )}
        </View>

        {current.source !== "vision" ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Sample estimate</Text>
            <Text style={styles.bannerCopy}>
              These numbers are the saved {sampleName} example, not a live reading of a photo. Connect a server in Settings for a real estimate.
            </Text>
          </View>
        ) : null}

        <View style={styles.confidence}>
          <Text style={styles.confidenceLabel}>{confidenceCopy(current.confidence)}</Text>
          {current.notes ? <Text style={styles.notes}>{current.notes}</Text> : null}
          {current.excluded.length > 0 ? (
            <Text style={styles.excluded}>Left out: {current.excluded.join("; ")}</Text>
          ) : null}
        </View>

        <View style={styles.typeBlock}>
          <Text style={styles.typeLabel}>Meal</Text>
          <MealTypePicker value={mealType} onChange={setMealType} />
        </View>

        <View style={styles.items}>
          {items.map((item) => (
            <FoodCard
              key={item.id}
              item={item}
              onChange={(next) => setItems((current) => current.map((entry) => (entry.id === item.id ? next : entry)))}
              onRemove={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            />
          ))}
          <AddFoodForm onAdd={(item) => setItems((current) => [...current, item])} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {editing ? (
          <Pressable accessibilityRole="button" onPress={removeSaved} style={styles.deleteLink}>
            <Text style={styles.deleteText}>Remove from log</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.footerTotals}>
          <Text style={styles.footerCalories}>{view.totals.calories}</Text>
          <Text style={styles.footerUnit}>kcal</Text>
          <View style={styles.footerMacros}>
            <MacroLine totals={view.totals} compact />
          </View>
        </View>
        <PrimaryButton
          label={saving ? "Saving…" : editing ? "Update meal" : `Save ${mealTypeLabel(mealType).toLowerCase()}`}
          onPress={save}
          disabled={saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 40,
  },
  backText: {
    color: colors.ink,
    fontWeight: "600",
  },
  screenTitle: {
    ...displayFont,
    fontSize: 28,
    color: colors.ink,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    minHeight: 180,
    justifyContent: "center",
    paddingVertical: 16,
  },
  photo: {
    width: "100%",
    height: 240,
  },
  banner: {
    backgroundColor: colors.greenSoft,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  bannerTitle: {
    color: colors.greenDark,
    fontWeight: "800",
  },
  bannerCopy: {
    color: colors.greenDark,
    lineHeight: 20,
  },
  confidence: {
    gap: 6,
  },
  confidenceLabel: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    color: colors.ink,
    fontWeight: "700",
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  notes: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  excluded: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  typeBlock: {
    gap: 8,
  },
  typeLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  items: {
    gap: 12,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
    overflow: "hidden",
  },
  deleteLink: {
    alignItems: "center",
    paddingVertical: 6,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: "700",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  footerTotals: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerCalories: {
    ...displayFont,
    fontSize: 32,
    lineHeight: 36,
    color: colors.ink,
  },
  footerUnit: {
    color: colors.calorie,
    fontWeight: "800",
  },
  footerMacros: {
    marginLeft: "auto",
  },
});
