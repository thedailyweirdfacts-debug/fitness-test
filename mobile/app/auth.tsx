import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton, SecondaryButton } from "../src/components/ui";
import { getSupabase } from "../src/lib/supabase";
import { useApp } from "../src/state/AppContext";
import { colors, displayFont } from "../src/theme";

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accountsEnabled, passwordReset, clearPasswordReset, settings, saveSettings } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    const supabase = getSupabase();
    if (!supabase) return;
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      setError("Enter the email address for this account.");
      return;
    }
    if (mode !== "reset" && password.length < 6) {
      setError("Use a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: "plateful://reset-password",
        });
        if (resetError) throw resetError;
        setNotice("If that email has an account, a reset link is on its way. Open it on this phone.");
        return;
      }
      if (mode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: address, password });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Check your email to confirm the account, then come back and sign in.");
          setMode("sign-in");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: address, password });
        if (signInError) throw signInError;
      }
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword() {
    const supabase = getSupabase();
    if (!supabase) return;
    if (password.length < 6) {
      setError("Use a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearPasswordReset();
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save that password.");
    } finally {
      setBusy(false);
    }
  }

  async function useDemo() {
    await saveSettings({ ...settings, useDemoMode: true });
    router.replace("/");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>{passwordReset ? "Choose a new password" : "Your account"}</Text>
      <Text style={styles.lead}>
        Each person signs in with their own email. Meals, history, goals, streaks, and badges stay with that account, including after a reinstall.
      </Text>

      {!accountsEnabled ? (
        <Text style={styles.error}>Accounts aren't set up in this build yet. Demo mode still works on this phone.</Text>
      ) : null}

      {passwordReset ? (
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="New password"
          placeholderTextColor={colors.faint}
          style={styles.input}
          accessibilityLabel="New password"
        />
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.faint}
            style={styles.input}
            accessibilityLabel="Email"
          />
          {mode !== "reset" ? (
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.faint}
              style={styles.input}
              accessibilityLabel="Password"
            />
          ) : null}
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {passwordReset ? (
        <PrimaryButton label={busy ? "Saving…" : "Save password"} disabled={busy || !accountsEnabled} onPress={() => void saveNewPassword()} />
      ) : (
        <PrimaryButton
          label={busy ? "Working…" : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          disabled={busy || !accountsEnabled}
          onPress={() => void submit()}
        />
      )}

      {!passwordReset ? (
        <View style={styles.links}>
          <Pressable accessibilityRole="button" accessibilityLabel={mode === "sign-up" ? "Sign in" : "Create account"} onPress={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}>
            <Text style={styles.link}>{mode === "sign-up" ? "Already have an account? Sign in" : "New here? Create an account"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Forgot password" onPress={() => setMode(mode === "reset" ? "sign-in" : "reset")}>
            <Text style={styles.link}>{mode === "reset" ? "Back to sign in" : "Forgot password"}</Text>
          </Pressable>
        </View>
      ) : null}

      <SecondaryButton label="Use demo mode" onPress={() => void useDemo()} />
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
    alignSelf: "flex-start",
    gap: 2,
    paddingVertical: 8,
  },
  backText: {
    color: colors.ink,
    fontSize: 16,
  },
  title: {
    ...displayFont,
    fontSize: 32,
    color: colors.ink,
  },
  lead: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    color: colors.greenDark,
    fontSize: 14,
    lineHeight: 20,
  },
  links: {
    gap: 10,
  },
  link: {
    color: colors.greenDark,
    fontWeight: "700",
  },
});
