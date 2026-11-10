import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildRewardReport,
  dailyTotals,
  dayKeyFromDate,
  getSample,
  mockSampleForSeed,
  SAMPLE_ORDER,
  sampleBlurb,
  sampleTitle,
} from "../../../shared/src";
import { GoalProgress } from "../../src/components/GoalProgress";
import { MacroLine, PlateArt } from "../../src/components/ui";
import { AnalyzeError, analyzeImage, analyzeMealText } from "../../src/lib/api";
import { draftFromAnalysis } from "../../src/lib/draft";
import { preparePlatePhoto } from "../../src/lib/photos";
import { resolveAppSecret } from "../../src/lib/settings";
import { useApp } from "../../src/state/AppContext";
import { colors, displayFont, shadow } from "../../src/theme";
import { formatAmount } from "../../src/components/ui";

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, meals, openDraft, session, scansRemaining, refreshQuota, noteScansRemaining, syncError } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [mealText, setMealText] = useState("");
  const todayKey = dayKeyFromDate(new Date());
  const today = dailyTotals(meals, todayKey);
  const hasToday = meals.some((meal) => dayKeyFromDate(new Date(meal.loggedAt)) === todayKey);
  const report = buildRewardReport(
    meals,
    {
      calorieGoal: settings.calorieGoal,
      proteinGoal: settings.proteinGoal,
      windowPercent: settings.goalWindowPercent,
    },
    todayKey,
  );

  useFocusEffect(
    useCallback(() => {
      if (session && !settings.useDemoMode) void refreshQuota();
    }, [session, settings.useDemoMode, refreshQuota]),
  );

  async function choose(source: "camera" | "library") {
    setError(null);
    if (!settings.useDemoMode && settings.apiBaseUrl && !session) {
      router.push("/auth");
      return;
    }
    if (!settings.useDemoMode && settings.apiBaseUrl && scansRemaining === 0) {
      setError("No free scans left today. They reset overnight, Pacific time. Demo mode still works.");
      return;
    }
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === "camera"
          ? "Camera access is off. Enable it in your phone settings, or choose a photo from the gallery."
          : "Photo access is off. Enable it in your phone settings, or take a picture instead.",
      );
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, exif: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPreview(asset.uri);
    setBusy(settings.useDemoMode ? "Using a sample meal…" : "Reading the plate…");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    try {
      let photoUri = asset.uri;
      let prepared: Awaited<ReturnType<typeof preparePlatePhoto>> | null = null;
      try {
        prepared = await preparePlatePhoto(asset.uri, asset.width, asset.height);
        photoUri = prepared.uri;
        setPreview(photoUri);
      } catch {
        if (!settings.useDemoMode) {
          throw new AnalyzeError("That photo couldn't be prepared. Try another one.", "bad_response");
        }
      }

      if (settings.useDemoMode || !settings.apiBaseUrl) {
        const sample = mockSampleForSeed(`${asset.uri}:${asset.fileSize ?? 0}`);
        openDraft(draftFromAnalysis(sample.analysis, { photoUri, source: "demo", sampleId: sample.id }));
      } else {
        if (!prepared) throw new AnalyzeError("That photo couldn't be prepared. Try another one.", "bad_response");
        const result = await analyzeImage(
          settings.apiBaseUrl,
          prepared,
          resolveAppSecret(settings.appSecret),
          session?.accessToken ?? "",
        );
        noteScansRemaining(result.scansRemaining);
        openDraft(draftFromAnalysis(result.analysis, { photoUri, source: "vision", sampleId: null }));
      }
      router.push("/results");
    } catch (caught) {
      const message = caught instanceof AnalyzeError ? caught.message : "Something went wrong while reading that photo.";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function submitText() {
    setError(null);
    const text = mealText.trim();
    if (!text) {
      setError("Describe what you ate.");
      return;
    }
    if (!settings.useDemoMode && settings.apiBaseUrl && !session) {
      router.push("/auth");
      return;
    }
    if (!settings.useDemoMode && settings.apiBaseUrl && scansRemaining === 0) {
      setError("No free scans left today. They reset overnight, Pacific time. Demo mode still works.");
      return;
    }
    setPreview(null);
    setBusy(settings.useDemoMode || !settings.apiBaseUrl ? "Using a sample meal…" : "Estimating that meal…");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    try {
      if (settings.useDemoMode || !settings.apiBaseUrl) {
        const sample = mockSampleForSeed(text);
        openDraft(draftFromAnalysis(sample.analysis, { photoUri: null, source: "demo", sampleId: sample.id }));
      } else {
        const result = await analyzeMealText(
          settings.apiBaseUrl,
          text,
          resolveAppSecret(settings.appSecret),
          session?.accessToken ?? "",
        );
        noteScansRemaining(result.scansRemaining);
        openDraft(draftFromAnalysis(result.analysis, { photoUri: null, source: "vision", sampleId: null }));
      }
      setMealText("");
      setWriting(false);
      router.push("/results");
    } catch (caught) {
      const message = caught instanceof AnalyzeError ? caught.message : "Something went wrong while estimating that meal.";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  function openSample(id: (typeof SAMPLE_ORDER)[number]) {
    setError(null);
    openDraft(
      draftFromAnalysis(getSample(id), {
        photoUri: null,
        source: "sample",
        sampleId: id,
      }),
    );
    router.push("/results");
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>Plateful</Text>
            <Text style={styles.tagline}>Snap a plate, or type what you ate.</Text>
            {session && !settings.useDemoMode ? (
              <Text style={styles.scans}>
                {scansRemaining == null ? "Checking free scans…" : `${scansRemaining} free scans left today`}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
            style={styles.gear}
          >
            <Ionicons name="settings-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {syncError ? <Text style={styles.error}>{syncError}</Text> : null}
        {!session && !settings.useDemoMode && settings.apiBaseUrl ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in" onPress={() => router.push("/auth")} style={styles.signIn}>
            <Text style={styles.signInText}>Sign in to log a meal</Text>
          </Pressable>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel="Open today's log" onPress={() => router.push("/log")} style={styles.today}>
          <Text style={styles.kicker}>Today</Text>
          {hasToday ? (
            <>
              <View style={styles.todayNumber}>
                <Text style={styles.calories}>{today.calories}</Text>
                <Text style={styles.caloriesUnit}>kcal</Text>
              </View>
              <MacroLine totals={today} compact />
            </>
          ) : (
            <Text style={styles.todayEmpty}>Nothing logged yet. Your running total will show up here.</Text>
          )}
          {settings.calorieGoal != null ? (
            <GoalProgress status={report.today} currentStreak={report.currentStreak} bestStreak={report.bestStreak} />
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take a photo"
          disabled={busy !== null}
          onPress={() => choose("camera")}
          style={({ pressed }) => [styles.shutter, pressed && styles.pressed]}
        >
          <View style={styles.shutterIcon}>
            <Ionicons name="camera" size={28} color={colors.white} />
          </View>
          <Text style={styles.shutterTitle}>Take a photo</Text>
          <Text style={styles.shutterCopy}>Fill the frame with your plate. Forks and hands help with scale.</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
          disabled={busy !== null}
          onPress={() => choose("library")}
          style={({ pressed }) => [styles.gallery, pressed && styles.pressed]}
        >
          <Ionicons name="images-outline" size={18} color={colors.ink} />
          <Text style={styles.galleryText}>Choose from gallery</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type what you ate"
          disabled={busy !== null}
          onPress={() => {
            setError(null);
            setWriting(true);
          }}
          style={({ pressed }) => [styles.gallery, pressed && styles.pressed]}
        >
          <Ionicons name="create-outline" size={18} color={colors.ink} />
          <Text style={styles.galleryText}>Type what you ate</Text>
        </Pressable>

        {writing ? (
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Meal description"
              value={mealText}
              onChangeText={setMealText}
              multiline
              maxLength={500}
              placeholder="Chick-fil-A grilled chicken sandwich with a medium fry"
              placeholderTextColor={colors.muted}
              style={styles.composerInput}
              textAlignVertical="top"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Estimate this meal"
              disabled={busy !== null}
              onPress={() => void submitText()}
              style={({ pressed }) => [styles.estimate, pressed && styles.pressed]}
            >
              <Text style={styles.estimateText}>Estimate this meal</Text>
            </Pressable>
          </View>
        ) : null}

        {settings.useDemoMode ? (
          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Demo mode is on</Text>
            <Text style={styles.demoCopy}>
              Photos and typed meals stay on this phone. You'll get one of two saved example meals so you can try the whole flow. Turn this off in Settings once your server is running.
            </Text>
            <View style={styles.samples}>
              {SAMPLE_ORDER.map((id) => (
                <Pressable key={id} accessibilityRole="button" onPress={() => openSample(id)} style={styles.sample}>
                  <PlateArt kind={id} />
                  <Text style={styles.sampleTitle}>{sampleTitle(id)}</Text>
                  <Text style={styles.sampleBlurb}>{sampleBlurb(id)}</Text>
                  <Text style={styles.sampleKcal}>
                    {id === "sausage-green-beans" ? "500 kcal" : "340 kcal"} · {id === "sausage-green-beans" ? `${formatAmount(20)}g protein` : `${formatAmount(4)}g protein`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {busy ? (
        <View style={styles.overlay}>
          {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : null}
          <ActivityIndicator color={colors.white} />
          <Text style={styles.overlayText}>{busy}</Text>
        </View>
      ) : null}
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
    paddingBottom: 120,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  wordmark: {
    ...displayFont,
    fontSize: 36,
    color: colors.ink,
  },
  tagline: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 2,
  },
  scans: {
    color: colors.greenDark,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  signIn: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
  },
  signInText: {
    color: colors.greenDark,
    fontWeight: "700",
    fontSize: 15,
  },
  gear: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  today: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
    ...shadow,
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  todayNumber: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  calories: {
    ...displayFont,
    fontSize: 42,
    lineHeight: 46,
    color: colors.ink,
  },
  caloriesUnit: {
    color: colors.calorie,
    fontWeight: "700",
    marginBottom: 6,
  },
  todayEmpty: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  shutter: {
    backgroundColor: colors.green,
    borderRadius: 28,
    padding: 22,
    gap: 8,
    minHeight: 168,
    justifyContent: "flex-end",
  },
  shutterIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  shutterTitle: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "700",
  },
  shutterCopy: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 15,
    lineHeight: 21,
  },
  gallery: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  galleryText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  composer: {
    gap: 10,
  },
  composerInput: {
    minHeight: 110,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  estimate: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  estimateText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
  demo: {
    gap: 10,
    marginTop: 4,
  },
  demoTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  demoCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  samples: {
    gap: 12,
  },
  sample: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  sampleTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 8,
  },
  sampleBlurb: {
    color: colors.muted,
    fontSize: 14,
  },
  sampleKcal: {
    color: colors.calorie,
    fontWeight: "700",
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
    overflow: "hidden",
    lineHeight: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(28, 25, 21, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  preview: {
    width: 180,
    height: 180,
    borderRadius: 28,
  },
  overlayText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
});
