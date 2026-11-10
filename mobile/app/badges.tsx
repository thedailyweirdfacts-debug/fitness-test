import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRewardsModel } from "../src/state/useRewards";
import { colors, displayFont } from "../src/theme";

export default function BadgesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rewards } = useRewardsModel();
  const earned = rewards.badges.filter((badge) => badge.earned).length;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <Text style={styles.wordmark}>Badges</Text>
      <Text style={styles.tagline}>
        {earned} of {rewards.badges.length} unlocked. Locked ones stay on the shelf until you earn them.
      </Text>
      {rewards.badges.map((badge) => (
        <View key={badge.id} style={[styles.badge, !badge.earned && styles.locked]}>
          <Text style={styles.mark}>{badge.earned ? "✓" : "○"}</Text>
          <View style={styles.copy}>
            <Text style={styles.title}>{badge.title}</Text>
            <Text style={styles.detail}>{badge.detail}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
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
    marginBottom: 6,
  },
  badge: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    alignItems: "center",
  },
  locked: {
    opacity: 0.55,
  },
  mark: {
    width: 28,
    textAlign: "center",
    color: colors.greenDark,
    fontSize: 18,
    fontWeight: "800",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
  },
  detail: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19,
  },
});
