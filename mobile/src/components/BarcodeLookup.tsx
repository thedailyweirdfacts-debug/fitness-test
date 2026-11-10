import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme";
import { BarcodeCamera } from "./BarcodeCamera";

export function BarcodeLookup({
  disabled,
  onLookup,
  onClose,
}: {
  disabled: boolean;
  onLookup: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Scan a barcode</Text>
      <Text style={styles.copy}>Point at the bars, or type the number. This uses the food database and does not spend a photo scan.</Text>
      <BarcodeCamera onCode={onLookup} />
      <TextInput
        accessibilityLabel="Barcode number"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={20}
        placeholder="9002490100070"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Look up barcode"
        disabled={disabled}
        onPress={() => onLookup(code)}
        style={({ pressed }) => [styles.lookup, pressed && styles.pressed]}
      >
        <Text style={styles.lookupText}>Look up barcode</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close barcode scan" onPress={onClose} style={styles.close}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 16,
  },
  lookup: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  lookupText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  close: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
});
