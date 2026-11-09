import { Platform, type TextStyle } from "react-native";

export const colors = {
  shell: "#E7E0D4",
  bg: "#F6F1E8",
  card: "#FFFCF7",
  ink: "#1C1915",
  muted: "#6F685E",
  faint: "#A39B90",
  line: "#E6DFD2",
  green: "#1F6B45",
  greenDark: "#144A30",
  greenSoft: "#E5F3EB",
  calorie: "#C65A24",
  protein: "#2A6F8F",
  carbs: "#9A7420",
  fat: "#A33B4A",
  danger: "#9C3B32",
  dangerSoft: "#F8E8E4",
  white: "#FFFFFF",
};

export const displayFont: TextStyle = {
  fontFamily: Platform.select({
    ios: "Georgia",
    android: "serif",
    default: "Georgia, 'Iowan Old Style', serif",
  }),
};

export const shadow = {
  shadowColor: "#302414",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 3,
};
