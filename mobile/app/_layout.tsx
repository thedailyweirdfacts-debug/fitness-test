import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RewardHost } from "../src/components/RewardHost";
import { LoadingBlock } from "../src/components/ui";
import { AppProvider, useApp } from "../src/state/AppContext";
import { colors, displayFont } from "../src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <View style={styles.shell}>
          <View style={styles.column}>
            <StatusBar style="dark" />
            <RootNavigator />
          </View>
        </View>
      </AppProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready } = useApp();
  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.wordmark}>Plateful</Text>
        <LoadingBlock label="Opening your log…" />
      </View>
    );
  }
  return (
    <View style={styles.navigator}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="results" />
        <Stack.Screen name="recipe" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="auth" />
      </Stack>
      <RewardHost />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.shell,
    alignItems: "center",
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.bg,
  },
  navigator: {
    flex: 1,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  wordmark: {
    ...displayFont,
    textAlign: "center",
    marginTop: 72,
    fontSize: 36,
    color: colors.ink,
  },
});
