import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mealTypeForTime, portionFromRecipe, recipeShareTotals, type MealType, type Recipe } from "../../../shared/src";
import { confirm } from "../../src/lib/confirm";
import { MealTypePicker } from "../../src/components/MealTypePicker";
import { useApp } from "../../src/state/AppContext";
import { colors, displayFont } from "../../src/theme";

const PORTIONS = [0.5, 1, 1.5, 2];

export default function FoodsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { recipes, deleteRecipe, saveDraft, settings } = useApp();
  const [logging, setLogging] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState<MealType>(mealTypeForTime(new Date()));
  const [error, setError] = useState<string | null>(null);

  async function addPortion(recipe: Recipe) {
    setError(null);
    const portion = portionFromRecipe(recipe, servings);
    try {
      await saveDraft({
        key: recipe.id,
        photoUri: recipe.photoUri,
        items: portion.items,
        confidence: recipe.confidence,
        notes: portion.notes,
        excluded: [],
        source: "recipe",
        sampleId: null,
        editingId: null,
        loggedAt: null,
        mealType,
      });
      setLogging(null);
      router.push("/log");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't add that serving.");
    }
  }

  async function remove(recipe: Recipe) {
    const ok = await confirm("Delete this recipe?", `${recipe.name} will leave My foods. Meals you already logged stay as they are.`);
    if (!ok) return;
    await deleteRecipe(recipe.id);
    if (logging === recipe.id) setLogging(null);
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
      <Text style={styles.wordmark}>My foods</Text>
      <Text style={styles.tagline}>Homemade recipes, estimated from the ingredients. Logging a serving is free.</Text>
      {settings.useDemoMode ? (
        <Text style={styles.demo}>Demo mode keeps recipes on this phone and uses a sample ingredient estimate.</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create recipe"
        onPress={() => router.push("/recipe")}
        style={styles.create}
      >
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.createText}>Create recipe</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {recipes.length === 0 ? (
        <Text style={styles.empty}>No saved foods yet. A recipe can start from ingredient photos, a barcode, or a few typed lines.</Text>
      ) : (
        recipes.map((recipe) => {
          const per = recipeShareTotals(recipe, 1);
          const open = logging === recipe.id;
          return (
            <View key={recipe.id} style={styles.card}>
              <Text style={styles.name}>{recipe.name}</Text>
              <Text style={styles.meta}>
                {per.calories} kcal per serving · {trim(recipe.servings)} in the batch
              </Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${recipe.name}`}
                  onPress={() => {
                    setLogging(open ? null : recipe.id);
                    setServings(1);
                    setMealType(mealTypeForTime(new Date()));
                  }}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Log</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${recipe.name}`}
                  onPress={() => router.push(`/recipe?id=${recipe.id}`)}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${recipe.name}`}
                  onPress={() => void remove(recipe)}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Delete</Text>
                </Pressable>
              </View>
              {open ? (
                <View style={styles.logBox}>
                  <View style={styles.portions}>
                    {PORTIONS.map((amount) => {
                      const selected = servings === amount;
                      const label = amount === 1 ? "1 serving" : `${amount} servings`;
                      return (
                        <Pressable
                          key={amount}
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          accessibilityState={{ selected }}
                          onPress={() => setServings(amount)}
                          style={[styles.chip, selected && styles.chipOn]}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <MealTypePicker value={mealType} onChange={setMealType} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Add to today" onPress={() => void addPortion(recipe)} style={styles.primary}>
                    <Text style={styles.primaryText}>Add to today</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function trim(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

const styles = StyleSheet.create({
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
  tagline: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  demo: {
    color: colors.greenDark,
    fontSize: 14,
    lineHeight: 20,
  },
  create: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.green,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  empty: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  primary: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: {
    color: colors.white,
    fontWeight: "700",
  },
  secondary: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryText: {
    color: colors.ink,
    fontWeight: "700",
  },
  logBox: {
    gap: 10,
  },
  portions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  chipOn: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
  },
  chipText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 13,
  },
  chipTextOn: {
    color: colors.greenDark,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
  },
});
