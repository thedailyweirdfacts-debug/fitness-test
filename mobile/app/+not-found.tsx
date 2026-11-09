import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, displayFont } from "../src/theme";

export default function NotFound() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>That screen isn't on the menu.</Text>
      <Link href="/" style={styles.link}>
        Back to your plate
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    ...displayFont,
    fontSize: 28,
    color: colors.ink,
    textAlign: "center",
  },
  link: {
    color: colors.greenDark,
    fontWeight: "700",
    fontSize: 16,
  },
});
