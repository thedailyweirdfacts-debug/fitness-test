import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../src/theme";

type TabBarProps = {
  state: {
    index: number;
    routes: Array<{ key: string; name: string }>;
  };
  navigateToTab: (routeKey: string) => void;
};

const TABS = {
  index: { label: "Scan", icon: "camera-outline" as const },
  log: { label: "Log", icon: "book-outline" as const },
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar state={props.state} navigateToTab={props.navigateToTab} />}
    >
      <Tabs.Screen name="index" options={{ title: "Scan" }} />
      <Tabs.Screen name="log" options={{ title: "Log" }} />
    </Tabs>
  );
}

function AppTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const tab = TABS[route.name as keyof typeof TABS] ?? { label: route.name, icon: "ellipse-outline" as const };
        const color = focused ? colors.green : colors.faint;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            onPress={() => navigateToTab(route.key)}
            style={styles.item}
          >
            <Ionicons name={tab.icon} size={22} color={color} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 48,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
});
