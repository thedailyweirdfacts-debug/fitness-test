import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createRecipeId,
  demoRecipeAnalysis,
  itemsFromAnalysis,
  presentMeal,
  type Confidence,
  type FoodItem,
} from "../../shared/src";
import { BarcodeLookup } from "../src/components/BarcodeLookup";
import { FoodCard } from "../src/components/FoodCard";
import { AnalyzeError, analyzeRecipe } from "../src/lib/api";
import { preparePlatePhoto, type PreparedPhoto } from "../src/lib/photos";
import { resolveAppSecret } from "../src/lib/settings";
import { useApp } from "../src/state/AppContext";
import { colors, displayFont } from "../src/theme";

export default function RecipeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const recipeId = typeof params.id === "string" ? params.id : "";
  const { recipes, saveRecipe, session, settings, scansRemaining, noteScansRemaining } = useApp();
  const existing = recipes.find((recipe) => recipe.id === recipeId) ?? null;
  const [phase, setPhase] = useState<"build" | "review">(existing ? "review" : "build");
  const [name, setName] = useState(existing?.name ?? "");
  const [servingsText, setServingsText] = useState(existing ? String(existing.servings) : "4");
  const [cookedText, setCookedText] = useState(existing?.cookedGrams ? String(existing.cookedGrams) : "");
  const [linesText, setLinesText] = useState("");
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dish, setDish] = useState<PreparedPhoto | null>(null);
  const [items, setItems] = useState<FoodItem[]>(existing?.items ?? []);
  const [confidence, setConfidence] = useState<Confidence>(existing?.confidence ?? "medium");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto(kind: "ingredient" | "dish", source: "camera" | "library") {
    setError(null);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Camera or photo access is off. You can type the ingredients instead.");
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const prepared = await preparePlatePhoto(asset.uri, asset.width, asset.height);
    if (kind === "dish") setDish(prepared);
    else setPhotos((current) => [...current, prepared].slice(0, 4));
  }

  async function estimate() {
    setError(null);
    const lines = ingredientLines(linesText);
    const count = lines.length + photos.length + barcodes.length;
    if (count === 0) {
      setError("Add an ingredient photo, a barcode, or a line like 2 cups rice.");
      return;
    }
    if (count > 6) {
      setError("Use up to 6 ingredients. Type the rest into fewer lines.");
      return;
    }
    const demo = settings.useDemoMode || !settings.apiBaseUrl;
    if (!demo && !session) {
      router.push("/auth");
      return;
    }
    const needsScan = !demo && (lines.length > 0 || photos.length > 0 || dish != null);
    if (needsScan && scansRemaining === 0) {
      setError("No free scans left today. They reset overnight, Pacific time. Logging a saved recipe still works.");
      return;
    }
    setBusy(true);
    try {
      if (demo) {
        const described = [
          ...lines,
          ...photos.map((_, index) => `Ingredient photo ${index + 1}`),
          ...barcodes.map((code) => `Barcode ${code}`),
        ];
        const analysis = demoRecipeAnalysis(described);
        setItems(itemsFromAnalysis(analysis));
        setConfidence(analysis.confidence);
        setNotes(analysis.notes);
      } else {
        const result = await analyzeRecipe(
          settings.apiBaseUrl,
          {
            ingredients: [
              ...lines.map((text) => ({ text })),
              ...photos.map((photo) => ({ imageBase64: photo.imageBase64, mimeType: photo.mimeType })),
              ...barcodes.map((barcode) => ({ barcode })),
            ],
            ...(dish ? { dishImageBase64: dish.imageBase64, dishMimeType: dish.mimeType } : {}),
          },
          resolveAppSecret(settings.appSecret),
          session?.accessToken ?? "",
        );
        if (result.scansRemaining != null) noteScansRemaining(result.scansRemaining);
        setItems(itemsFromAnalysis(result.analysis));
        setConfidence(result.analysis.confidence);
        setNotes(result.analysis.notes);
      }
      setPhase("review");
    } catch (caught) {
      setError(caught instanceof AnalyzeError ? caught.message : "Couldn't estimate that recipe.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    const title = name.trim();
    const servings = Number(servingsText);
    const cooked = cookedText.trim() ? Number(cookedText) : null;
    if (!title) {
      setError("Name the recipe.");
      return;
    }
    if (!Number.isFinite(servings) || servings < 1 || servings > 40) {
      setError("Servings should be between 1 and 40.");
      return;
    }
    if (cookedText.trim() && (!Number.isFinite(cooked) || cooked == null || cooked <= 0 || cooked > 20000)) {
      setError("Cooked weight should be the grams of the finished batch.");
      return;
    }
    if (items.length === 0) {
      setError("Estimate the ingredients before saving.");
      return;
    }
    setBusy(true);
    try {
      await saveRecipe({
        id: existing?.id ?? createRecipeId(),
        name: title,
        servings,
        cookedGrams: cooked,
        photoUri: dish?.uri ?? existing?.photoUri ?? null,
        items,
        confidence,
        notes,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save that recipe.");
    } finally {
      setBusy(false);
    }
  }

  const batch = presentMeal(items).totals;
  const servingsNumber = Number(servingsText);
  const perServing =
    Number.isFinite(servingsNumber) && servingsNumber >= 1 ? Math.round(batch.calories / servingsNumber) : null;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>{existing ? "Edit recipe" : "Create recipe"}</Text>
      <Text style={styles.copy}>
        Ingredient amounts decide the calories. The finished dish is the picture you see later.
      </Text>

      {phase === "build" ? (
        <View style={styles.block}>
          <TextInput
            accessibilityLabel="Recipe ingredients"
            value={linesText}
            onChangeText={setLinesText}
            multiline
            placeholder={"2 cups rice\n1 lb chicken breast"}
            placeholderTextColor={colors.muted}
            style={styles.input}
            textAlignVertical="top"
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Add ingredient photo" onPress={() => void addPhoto("ingredient", "library")} style={styles.secondary}>
            <Text style={styles.secondaryText}>Add ingredient photo ({photos.length})</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Add a barcode" onPress={() => setScanning(true)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Add a barcode ({barcodes.length})</Text>
          </Pressable>
          {scanning ? (
            <BarcodeLookup
              disabled={busy}
              onClose={() => setScanning(false)}
              onLookup={(code) => {
                const digits = code.replace(/\D/g, "");
                if (digits.length >= 8 && digits.length <= 14) setBarcodes((current) => [...current, digits].slice(0, 6));
                setScanning(false);
              }}
            />
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Add finished dish photo" onPress={() => void addPhoto("dish", "library")} style={styles.secondary}>
            <Text style={styles.secondaryText}>{dish ? "Finished dish added" : "Add finished dish photo"}</Text>
          </Pressable>
        </View>
      ) : null}

      <TextInput accessibilityLabel="Recipe name" value={name} onChangeText={setName} placeholder="Chicken rice" placeholderTextColor={colors.muted} style={styles.name} />
      <TextInput
        accessibilityLabel="Servings"
        value={servingsText}
        onChangeText={setServingsText}
        keyboardType="decimal-pad"
        placeholder="4"
        placeholderTextColor={colors.muted}
        style={styles.name}
      />
      <TextInput
        accessibilityLabel="Cooked weight"
        value={cookedText}
        onChangeText={setCookedText}
        keyboardType="number-pad"
        placeholder="Cooked weight in grams, optional"
        placeholderTextColor={colors.muted}
        style={styles.name}
      />

      {phase === "review" ? (
        <View style={styles.block}>
          <Text style={styles.batch}>
            {batch.calories} kcal for the whole batch{perServing != null ? ` · ${perServing} kcal per serving` : ""}
          </Text>
          {notes ? <Text style={styles.notes}>{notes}</Text> : null}
          {items.map((item) => (
            <FoodCard
              key={item.id}
              item={item}
              onChange={(next) => setItems((current) => current.map((entry) => (entry.id === item.id ? next : entry)))}
              onRemove={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            />
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {phase === "build" ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Estimate recipe" disabled={busy} onPress={() => void estimate()} style={styles.primary}>
          <Text style={styles.primaryText}>{busy ? "Estimating…" : "Estimate recipe"}</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Save recipe" disabled={busy} onPress={() => void save()} style={styles.primary}>
          <Text style={styles.primaryText}>{busy ? "Saving…" : "Save recipe"}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function ingredientLines(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parts = trimmed.includes("\n") ? trimmed.split("\n") : trimmed.split(",");
  return parts.map((part) => part.trim()).filter((part) => part.length > 0).slice(0, 6);
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 80,
    gap: 12,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 40,
    alignSelf: "flex-start",
  },
  backText: {
    color: colors.ink,
    fontWeight: "700",
  },
  title: {
    ...displayFont,
    fontSize: 32,
    color: colors.ink,
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  block: {
    gap: 10,
  },
  input: {
    minHeight: 110,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 16,
  },
  name: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 16,
  },
  secondary: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: colors.ink,
    fontWeight: "700",
  },
  primary: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  batch: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  notes: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
    lineHeight: 20,
  },
});
