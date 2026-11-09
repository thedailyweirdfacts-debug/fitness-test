import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseGoalInput } from "../../shared/src";
import { PrimaryButton } from "../src/components/ui";
import { checkHealth, type HealthReport } from "../src/lib/api";
import { normalizeApiBaseUrl } from "../src/lib/settings";
import { useApp } from "../src/state/AppContext";
import { colors, displayFont } from "../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, saveSettings } = useApp();
  const [useDemoMode, setUseDemoMode] = useState(settings.useDemoMode);
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [appSecret, setAppSecret] = useState(settings.appSecret);
  const [calorieText, setCalorieText] = useState(settings.calorieGoal?.toString() ?? "");
  const [proteinText, setProteinText] = useState(settings.proteinGoal?.toString() ?? "");
  const [goalWindowPercent, setGoalWindowPercent] = useState(settings.goalWindowPercent);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUseDemoMode(settings.useDemoMode);
    setApiBaseUrl(settings.apiBaseUrl);
    setAppSecret(settings.appSecret);
    setCalorieText(settings.calorieGoal?.toString() ?? "");
    setProteinText(settings.proteinGoal?.toString() ?? "");
    setGoalWindowPercent(settings.goalWindowPercent);
  }, [settings]);

  async function save() {
    const url = normalizeApiBaseUrl(apiBaseUrl);
    if (!useDemoMode && !url) {
      setError("Add the server address before turning demo mode off.");
      return;
    }
    if (url && !/^https?:\/\//i.test(url)) {
      setError("The address should start with http:// or https://.");
      return;
    }
    const calorieGoal = parseGoalInput(calorieText, 20000);
    const proteinGoal = parseGoalInput(proteinText, 1000);
    if (calorieGoal === "invalid") {
      setError("Use a calorie goal between 1 and 20000, or leave it blank.");
      return;
    }
    if (proteinGoal === "invalid") {
      setError("Use a protein goal between 1 and 1000 grams, or leave it blank.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSettings({
        useDemoMode,
        apiBaseUrl: url,
        appSecret: appSecret.trim(),
        calorieGoal,
        proteinGoal,
        goalWindowPercent,
      });
      setStatus("Saved.");
    } catch {
      setError("Couldn't save settings on this device.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setError(null);
    setStatus("Checking…");
    try {
      const health: HealthReport = await checkHealth(normalizeApiBaseUrl(apiBaseUrl));
      setStatus(
        health.configured
          ? `Connected. ${health.provider} · ${health.model}. The key is set on the server.`
          : `The server is up (${health.provider} · ${health.model}) but it has no API key yet.`,
      );
    } catch (caught) {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "Couldn't reach the server.");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.lead}>
        The Gemini key stays on the server. This app only knows the server address and a shared password, so a stranger cannot spend your free quota.
      </Text>

      <View style={styles.card}>
        <Text style={styles.rowTitle}>Daily calorie goal</Text>
        <Text style={styles.rowCopy}>
          Optional. Leave it blank and the goal stays off. A day counts when the total lands inside the window, so a much larger day does not count.
        </Text>
        <TextInput
          value={calorieText}
          onChangeText={setCalorieText}
          keyboardType="number-pad"
          placeholder="2000"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Daily calorie goal"
        />
        <Text style={styles.rowTitle}>Protein goal</Text>
        <Text style={styles.rowCopy}>Also optional. Meeting it is a bonus, not a requirement for the streak.</Text>
        <TextInput
          value={proteinText}
          onChangeText={setProteinText}
          keyboardType="number-pad"
          placeholder="Grams"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Protein goal"
        />
        <Text style={styles.rowTitle}>Window</Text>
        <View style={styles.chips}>
          {[5, 10, 15, 20].map((percent) => {
            const selected = goalWindowPercent === percent;
            return (
              <Pressable
                key={percent}
                accessibilityRole="button"
                accessibilityLabel={`Within ${percent} percent`}
                accessibilityState={{ selected }}
                onPress={() => setGoalWindowPercent(percent)}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>±{percent}%</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Demo mode</Text>
            <Text style={styles.rowCopy}>Use the two saved example meals instead of calling a model.</Text>
          </View>
          <Switch
            accessibilityLabel="Demo mode"
            value={useDemoMode}
            onValueChange={setUseDemoMode}
            trackColor={{ true: colors.green, false: colors.line }}
            thumbColor={colors.white}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.rowTitle}>Server address</Text>
        <Text style={styles.rowCopy}>On a phone this must be your computer's Wi-Fi address, not localhost.</Text>
        <TextInput
          value={apiBaseUrl}
          onChangeText={setApiBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.1.20:8787"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="Server address"
        />
        <Pressable accessibilityRole="button" onPress={testConnection} style={styles.link}>
          <Text style={styles.linkText}>Check connection</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.rowTitle}>App secret</Text>
        <Text style={styles.rowCopy}>
          The same password you set as APP_SECRET on the server. This is not the Gemini key. Leave it blank to use the one baked into this install.
        </Text>
        <TextInput
          value={appSecret}
          onChangeText={setAppSecret}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Shared password"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="App secret"
        />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={saving ? "Saving…" : "Save settings"} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
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
    fontWeight: "600",
  },
  title: {
    ...displayFont,
    fontSize: 36,
    color: colors.ink,
  },
  lead: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  rowCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 16,
  },
  link: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  linkText: {
    color: colors.greenDark,
    fontWeight: "700",
  },
  chips: {
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
  chipText: {
    color: colors.ink,
    fontWeight: "700",
  },
  chipTextOn: {
    color: colors.white,
  },
  status: {
    color: colors.greenDark,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
    overflow: "hidden",
  },
});
