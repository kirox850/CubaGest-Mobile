import React, { useState } from "react";
import { TouchableOpacity, Text, Alert, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/roles";
import { colors, shadow } from "../config/theme";

import DashboardScreen    from "../screens/DashboardScreen";
import InventarioScreen   from "../screens/InventarioScreen";
import POSScreen          from "../screens/POSScreen";
import FacturacionScreen  from "../screens/FacturacionScreen";
import ContabilidadScreen from "../screens/ContabilidadScreen";
import UsuariosScreen     from "../screens/UsuariosScreen";

const Tab = createBottomTabNavigator();

// Íconos SVG-style como texto Unicode con rounded style
const TAB_ICONS = {
  dashboard:    { outline: "⊞",  filled: "⊟"  },
  inventario:   { outline: "⬡",  filled: "⬢"  },
  pos:          { outline: "⬜",  filled: "⬛"  },
  facturacion:  { outline: "☐",  filled: "☑"  },
  contabilidad: { outline: "◎",  filled: "●"  },
  usuarios:     { outline: "◯",  filled: "⬤"  },
};

// Emojis modernos como íconos de tab
const TAB_EMOJI = {
  dashboard:    "📊",
  inventario:   "📦",
  pos:          "🖥️",
  facturacion:  "🧾",
  contabilidad: "💰",
  usuarios:     "👥",
};

const ALL_TABS = [
  { key: "dashboard",    label: "Inicio",     component: DashboardScreen },
  { key: "inventario",   label: "Inventario", component: InventarioScreen },
  { key: "pos",          label: "Vender",     component: POSScreen },
  { key: "facturacion",  label: "Facturas",   component: FacturacionScreen },
  { key: "contabilidad", label: "Gastos",     component: ContabilidadScreen },
  { key: "usuarios",     label: "Usuarios",   component: UsuariosScreen },
];

function HeaderRight() {
  const { logout, online } = useAuth();

  const confirmLogout = () => {
    Alert.alert("Cerrar sesión", "¿Seguro que desea salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={styles.headerRight}>
      {!online && (
        <View style={styles.offlinePill}>
          <Text style={styles.offlinePillText}>● OFFLINE</Text>
        </View>
      )}
      <TouchableOpacity onPress={confirmLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Salir</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AppNavigator() {
  const { user } = useAuth();
  const perms = ROLES[user?.role]?.perms || [];
  const tabs  = ALL_TABS.filter(t => perms.includes(t.key));

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const tabKey = ALL_TABS.find(t => t.label === route.name)?.key;
          return {
            headerRight: () => <HeaderRight/>,
            headerStyle: {
              backgroundColor: "#ffffff",
              ...shadow.sm,
            },
            headerTitleStyle: {
              fontWeight: "800",
              fontSize: 17,
              color: colors.text,
            },
            headerTintColor: colors.text,
            tabBarActiveTintColor:   colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginBottom: 2 },
            tabBarStyle: {
              backgroundColor: "#ffffff",
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: 60,
              paddingTop: 6,
              ...shadow.sm,
            },
            tabBarIcon: ({ focused, color }) => (
              <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                <Text style={{ fontSize: 20 }}>{TAB_EMOJI[tabKey] || "●"}</Text>
              </View>
            ),
          };
        }}
      >
        {tabs.map(t => (
          <Tab.Screen key={t.key} name={t.label} component={t.component}/>
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, marginRight: 14 },
  offlinePill: {
    backgroundColor: colors.warning + "20",
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  offlinePillText: { color: colors.warning, fontSize: 10, fontWeight: "700" },
  logoutBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  logoutText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  tabIcon: { alignItems: "center", justifyContent: "center", width: 32, height: 28, borderRadius: 8 },
  tabIconActive: { backgroundColor: colors.primary + "15" },
});
