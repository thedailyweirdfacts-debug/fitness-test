import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../src/state/AppContext";
import { colors, displayFont } from "../src/theme";

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, settings, remoteRewards, rewardsNote, sendRewards } = useApp();
  const [code, setCode] = useState("");
  const [name, setName] = useState(remoteRewards?.displayName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = Boolean(session) && !settings.useDemoMode;

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const error = await sendRewards(body);
    setMessage(error);
    setBusy(false);
    if (!error && body.action === "request") setCode("");
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <Text style={styles.wordmark}>Friends</Text>
      <Text style={styles.tagline}>Add someone with their code. You both have to agree. Friends see your name, level, weekly XP, and streak. Not your meals or calories.</Text>

      {!signedIn ? (
        <Text style={styles.note}>Sign in, with demo mode off, to get a friend code. XP on this phone still counts for you.</Text>
      ) : null}
      {rewardsNote ? <Text style={styles.note}>{rewardsNote}</Text> : null}

      {signedIn && remoteRewards ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>Your code</Text>
          <Text selectable style={styles.code}>
            {remoteRewards.friendCode}
          </Text>
          <Text style={styles.meta}>Your friends type this. It is not a password.</Text>
          <TextInput
            accessibilityLabel="Display name"
            value={name}
            onChangeText={setName}
            maxLength={24}
            placeholder="Display name"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save display name"
            disabled={busy}
            onPress={() => void run({ action: "rename", displayName: name })}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Save name</Text>
          </Pressable>
        </View>
      ) : null}

      {signedIn ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>Add a friend</Text>
          <TextInput
            accessibilityLabel="Friend code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            maxLength={8}
            placeholder="AB12CD"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send friend request"
            disabled={busy}
            onPress={() => void run({ action: "request", code })}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Send request</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? <Text style={styles.note}>{message}</Text> : null}

      {remoteRewards && remoteRewards.requests.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>Requests</Text>
          {remoteRewards.requests.map((request) => (
            <View key={request.id} style={styles.request}>
              <Text style={styles.name}>{request.displayName}</Text>
              {request.direction === "in" ? (
                <View style={styles.requestRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Accept ${request.displayName}`}
                    disabled={busy}
                    onPress={() => void run({ action: "respond", id: request.id, accept: true })}
                    style={styles.small}
                  >
                    <Text style={styles.smallText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${request.displayName}`}
                    disabled={busy}
                    onPress={() => void run({ action: "respond", id: request.id, accept: false })}
                    style={styles.smallGhost}
                  >
                    <Text style={styles.ghostText}>Decline</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.meta}>Waiting for them to accept.</Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {remoteRewards ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>This week</Text>
          {remoteRewards.board.map((entry) => (
            <View key={`${entry.displayName}-${entry.you ? "you" : "friend"}`} style={styles.boardRow}>
              <View>
                <Text style={styles.name}>{entry.you ? `${entry.displayName} (you)` : entry.displayName}</Text>
                <Text style={styles.meta}>Level {entry.level} · {entry.streak} day streak</Text>
              </View>
              <Text style={styles.xp}>{entry.weeklyXp} XP</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 12,
    backgroundColor: colors.bg,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
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
  note: {
    color: colors.ink,
    backgroundColor: colors.greenSoft,
    borderRadius: 16,
    padding: 12,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  kicker: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  code: {
    ...displayFont,
    fontSize: 36,
    letterSpacing: 4,
    color: colors.ink,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 46,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 14,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800",
  },
  request: {
    gap: 6,
    paddingTop: 4,
  },
  requestRow: {
    flexDirection: "row",
    gap: 8,
  },
  small: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  smallText: {
    color: colors.white,
    fontWeight: "800",
  },
  smallGhost: {
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghostText: {
    color: colors.ink,
    fontWeight: "800",
  },
  name: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
  },
  boardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  xp: {
    color: colors.greenDark,
    fontWeight: "800",
  },
});
