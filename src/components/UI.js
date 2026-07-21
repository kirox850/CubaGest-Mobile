import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../config/theme";

export function Badge({ label, color = colors.primary }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "20" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function EmptyState({ text }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  error: { backgroundColor: colors.dangerBg, borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { color: colors.danger, fontSize: 13 },
});
