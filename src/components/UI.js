import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radius, shadow } from "../config/theme";

export const Badge = ({ label, color, bg }) => (
  <View style={[styles.badge, { backgroundColor: bg || (color + "18") }]}>
    <Text style={[styles.badgeText, { color: color || colors.primary }]}>{label}</Text>
  </View>
);

export const ErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>⚠ {message}</Text>
    </View>
  );
};

export const EmptyState = ({ text, icon }) => (
  <View style={styles.empty}>
    <Text style={styles.emptyIcon}>{icon || "📭"}</Text>
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

export const Spinner = ({ size = "large" }) => (
  <View style={styles.spinnerWrap}>
    <ActivityIndicator size={size} color={colors.primary}/>
  </View>
);

export const Card = ({ children, style }) => (
  <View style={[styles.card, shadow.sm, style]}>{children}</View>
);

export const SectionHeader = ({ title, subtitle }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
  </View>
);

export const StatCard = ({ label, value, sub, color, icon }) => (
  <View style={[styles.statCard, shadow.sm]}>
    <View style={styles.statHeader}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statIcon}>{icon}</Text>
    </View>
    <Text style={[styles.statValue, { color: color || colors.text }]}>{value}</Text>
    {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  errorBanner: {
    backgroundColor: colors.dangerBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },
  spinnerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 0,
  },
  statHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  statIcon: { fontSize: 18 },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  statSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
