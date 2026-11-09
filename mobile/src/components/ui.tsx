import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Confidence, Macros, SampleId } from "../../../shared/src";
import { colors, displayFont, shadow } from "../theme";

export function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function confidenceCopy(level: Confidence): string {
  if (level === "high") return "Fairly sure";
  if (level === "low") return "Rough guess";
  return "Ballpark";
}

export function MacroLine({ totals, compact = false }: { totals: Macros; compact?: boolean }) {
  const items = [
    { label: "Protein", value: totals.protein, color: colors.protein },
    { label: "Carbs", value: totals.carbs, color: colors.carbs },
    { label: "Fat", value: totals.fat, color: colors.fat },
  ];
  return (
    <View style={[styles.macroRow, compact && styles.macroRowCompact]}>
      {items.map((item) => (
        <View key={item.label} style={styles.macroItem}>
          <Text style={[styles.macroValue, { color: item.color }]}>{formatAmount(item.value)}g</Text>
          <Text style={styles.macroLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.white} /> : null}
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export function PlateArt({ kind }: { kind: SampleId | "empty" }) {
  const fries = kind === "fries-ketchup";
  return (
    <View style={styles.plateWrap}>
      <View style={styles.plate}>
        <View style={styles.plateInner}>
          {kind === "empty" ? (
            <Text style={styles.plateHint}>Your plate</Text>
          ) : fries ? (
            <>
              <View style={[styles.fry, { transform: [{ rotate: "-18deg" }] }]} />
              <View style={[styles.fry, styles.fryMid]} />
              <View style={[styles.fry, { transform: [{ rotate: "16deg" }] }]} />
              <View style={styles.ketchup} />
            </>
          ) : (
            <>
              <View style={styles.sausage} />
              <View style={[styles.bean, styles.beanLeft]} />
              <View style={[styles.bean, styles.beanRight]} />
              <View style={styles.mustard} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function cardStyle(extra?: StyleProp<ViewStyle>) {
  return [styles.card, extra];
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  macroRow: {
    flexDirection: "row",
    gap: 18,
  },
  macroRowCompact: {
    gap: 14,
  },
  macroItem: {
    gap: 2,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  macroLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  primary: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
  },
  primaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  secondary: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  plateWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  plate: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: "#E8D6BE",
    alignItems: "center",
    justifyContent: "center",
  },
  plateInner: {
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: "#FFF9F0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  plateHint: {
    color: colors.faint,
    fontSize: 13,
  },
  sausage: {
    position: "absolute",
    top: 42,
    width: 86,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#C4653A",
  },
  bean: {
    position: "absolute",
    width: 36,
    height: 12,
    borderRadius: 6,
  },
  beanLeft: {
    left: 34,
    bottom: 46,
    backgroundColor: "#3E8F55",
  },
  beanRight: {
    right: 38,
    bottom: 30,
    backgroundColor: "#246E40",
  },
  mustard: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#E1B423",
    right: 42,
    top: 58,
  },
  fry: {
    position: "absolute",
    width: 46,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E0A04A",
    top: 62,
  },
  fryMid: {
    top: 78,
    width: 54,
    backgroundColor: "#C9842F",
  },
  ketchup: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#C4473A",
    bottom: 36,
    right: 48,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.bg,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
  },
});
