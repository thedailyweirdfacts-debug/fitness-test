import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const BARCODES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] as const;

export function BarcodeCamera({ onCode }: { onCode: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const seen = useRef(false);

  if (!permission) return <View style={styles.camera} />;

  if (!permission.granted) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Allow camera"
        onPress={() => void requestPermission()}
        style={styles.allow}
      >
        <Text style={styles.allowText}>Allow the camera to scan a barcode</Text>
      </Pressable>
    );
  }

  return (
    <CameraView
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: [...BARCODES] }}
      onBarcodeScanned={(event) => {
        if (seen.current) return;
        const code = event.data.replace(/\D/g, "");
        if (code.length < 8 || code.length > 14) return;
        seen.current = true;
        onCode(code);
      }}
    />
  );
}

const styles = StyleSheet.create({
  camera: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.ink,
  },
  allow: {
    height: 220,
    borderRadius: 18,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  allowText: {
    color: colors.greenDark,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
