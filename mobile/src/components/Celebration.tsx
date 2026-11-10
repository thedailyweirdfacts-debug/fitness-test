import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, displayFont } from "../theme";

const DOTS = [
  { left: "12%", color: "#1F6B45", delay: 0 },
  { left: "28%", color: "#C65A24", delay: 80 },
  { left: "46%", color: "#2A6F8F", delay: 40 },
  { left: "63%", color: "#9A7420", delay: 120 },
  { left: "78%", color: "#1F6B45", delay: 20 },
  { left: "88%", color: "#C65A24", delay: 140 },
];

export function Celebration({ title, lines, onDone }: { title: string; lines: string[]; onDone: () => void }) {
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 720, useNativeDriver: true }).start();
  }, [rise]);

  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      {DOTS.map((dot) => (
        <Animated.View
          key={dot.left}
          pointerEvents="none"
          style={[
            styles.dot,
            {
              left: dot.left,
              backgroundColor: dot.color,
              opacity: rise.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [
                {
                  translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [20, -180] }),
                },
              ],
            },
          ]}
        />
      ))}
      <View style={styles.card}>
        <Text style={styles.kicker}>Nice</Text>
        <Text style={styles.title}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Keep going" onPress={onDone} style={styles.button}>
          <Text style={styles.buttonText}>Keep going</Text>
        </Pressable>
      </View>
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
    bottom: "42%",
    width: 12,
    height: 12,
    borderRadius: 6,
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
