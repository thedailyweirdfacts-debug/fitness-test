import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, displayFont } from "../theme";

const DOTS = [
  { left: "8%", color: "#1F6B45", delay: 0, size: 10 },
  { left: "18%", color: "#C65A24", delay: 60, size: 14 },
  { left: "30%", color: "#2A6F8F", delay: 20, size: 8 },
  { left: "42%", color: "#9A7420", delay: 90, size: 12 },
  { left: "54%", color: "#1F6B45", delay: 30, size: 16 },
  { left: "66%", color: "#C65A24", delay: 110, size: 9 },
  { left: "76%", color: "#2A6F8F", delay: 40, size: 13 },
  { left: "88%", color: "#9A7420", delay: 70, size: 11 },
  { left: "14%", color: "#A33B4A", delay: 130, size: 8 },
  { left: "36%", color: "#1F6B45", delay: 150, size: 10 },
  { left: "58%", color: "#C65A24", delay: 100, size: 7 },
  { left: "80%", color: "#2A6F8F", delay: 160, size: 12 },
];

export function Celebration({
  title,
  lines,
  onDone,
  tone = "badge",
}: {
  title: string;
  lines: string[];
  onDone: () => void;
  tone?: "goal" | "badge" | "level";
}) {
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: tone === "badge" ? 720 : 1100, useNativeDriver: true }).start();
  }, [rise, tone]);

  const kicker = tone === "level" ? "Level up" : tone === "goal" ? "Goal hit" : "New badge";
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      {DOTS.map((dot) => (
        <Animated.View
          key={`${dot.left}-${dot.delay}`}
          pointerEvents="none"
          style={[
            styles.dot,
            {
              left: dot.left,
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size / 2,
              backgroundColor: dot.color,
              opacity: rise.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                {
                  translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, tone === "badge" ? -180 : -280] }),
                },
              ],
            },
          ]}
        />
      ))}
      <Animated.View
        style={[
          styles.card,
          tone === "level" && styles.levelCard,
          {
            transform: [{ scale: rise.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.86, 1.04, 1] }) }],
          },
        ]}
      >
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={[styles.title, tone === "level" && styles.levelTitle]}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Keep going" onPress={onDone} style={styles.button}>
          <Text style={styles.buttonText}>Keep going</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(28, 25, 21, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 50,
  },
  dot: {
    position: "absolute",
    bottom: "46%",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 22,
    gap: 8,
    zIndex: 2,
  },
  levelCard: {
    paddingVertical: 32,
  },
  kicker: {
    color: colors.greenDark,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    ...displayFont,
    fontSize: 32,
    color: colors.ink,
  },
  levelTitle: {
    fontSize: 56,
  },
  line: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.green,
    borderRadius: 16,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
  },
});
