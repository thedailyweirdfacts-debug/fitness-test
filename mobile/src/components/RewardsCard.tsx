import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChallengeView, RewardView } from "../../../shared/src";
import { colors, displayFont, shadow } from "../theme";

export function LevelCard({
  rewards,
  onBadges,
  onFriends,
}: {
  rewards: RewardView;
  onBadges: () => void;
  onFriends: () => void;
}) {
  const width = rewards.xpForLevel > 0 ? Math.min(100, (rewards.xpIntoLevel / rewards.xpForLevel) * 100) : 0;
  const earned = rewards.badges.filter((badge) => badge.earned).length;
  const freeze = rewards.freezes === 1 ? "1 freeze" : `${rewards.freezes} freezes`;
  const streak = rewards.currentStreak > 0 ? `${rewards.currentStreak} day streak` : "Streak starts at the calorie window";
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Level {rewards.level}</Text>
      <Text style={styles.title}>{rewards.title}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${width}%` }]} />
      </View>
      <Text style={styles.meta}>
        {rewards.xpIntoLevel} / {rewards.xpForLevel} XP to the next level · {rewards.xp} XP total
      </Text>
      <Text style={styles.streak}>
        {streak} · {freeze} · best {rewards.bestStreak}
      </Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open badges" onPress={onBadges} style={styles.link}>
          <Text style={styles.linkText}>Badges {earned}/{rewards.badges.length}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open friends" onPress={onFriends} style={styles.link}>
          <Text style={styles.linkText}>Friends</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ChallengeCard({ challenges }: { challenges: ChallengeView[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>This week</Text>
      <Text style={styles.challengeTitle}>Three challenges. They reset Monday, Pacific time.</Text>
      {challenges.map((challenge) => {
        const width = challenge.target > 0 ? Math.min(100, (challenge.progress / challenge.target) * 100) : 0;
        return (
          <View key={challenge.id} style={styles.challenge}>
            <View style={styles.challengeHead}>
              <Text style={styles.challengeName}>{challenge.title}</Text>
              <Text style={styles.challengeXp}>{challenge.completed ? "Done" : `${challenge.xp} XP`}</Text>
            </View>
            <Text style={styles.challengeDetail}>{challenge.detail}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, challenge.completed && styles.fillDone, { width: `${width}%` }]} />
            </View>
            <Text style={styles.meta}>
              {challenge.progress} / {challenge.target}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
    ...shadow,
  },
  kicker: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    ...displayFont,
    fontSize: 28,
    color: colors.ink,
  },
  track: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.green,
  },
  fillDone: {
    backgroundColor: colors.calorie,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  streak: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  link: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    color: colors.greenDark,
    fontWeight: "800",
  },
  challengeTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
  },
  challenge: {
    gap: 4,
    paddingTop: 6,
  },
  challengeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  challengeName: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 15,
  },
  challengeXp: {
    color: colors.greenDark,
    fontWeight: "800",
    fontSize: 13,
  },
  challengeDetail: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
