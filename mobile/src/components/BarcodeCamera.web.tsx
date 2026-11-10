import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function BarcodeCamera(_props: { onCode: (code: string) => void }) {
  return (
    <View style={styles.note}>
      <Text style={styles.copy}>Type the numbers printed under the bars.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    borderRadius: 18,
    backgroundColor: colors.greenSoft,
    padding: 16,
  },
  copy: {
    color: colors.greenDark,
    fontSize: 15,
    lineHeight: 21,
  },
});
