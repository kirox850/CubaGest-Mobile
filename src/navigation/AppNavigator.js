import React, { useState } from "react";
import { TouchableOpacity, Text, Alert, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/roles";
import { colors } from "../config/theme";

import DashboardScreen    from "../screens/DashboardScreen";
import InventarioScreen   from "../screens/InventarioScreen";
import POSScreen          from "../screens/POSScreen";
import FacturacionScreen  from "../screens/FacturacionScreen";
import ContabilidadScreen from "../screens/ContabilidadScreen";
import UsuariosScreen     from "../screens/UsuariosScreen";

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  dashboard:    "🏠",
  inventario:   "📦",
  pos:          "🖥️",
  facturacion:  "🧾",
  contabilidad: "💰",
  usuarios:     "👥",
};

const ALL_TABS = [
  { key: "dashboard",    label: "Inicio",      component: DashboardScreen },
  { key: "inventario",   label: "Inventario",  component: InventarioScreen },
  { key: "pos",          label: "Vender",      component: POSScreen },
  { key: "facturacion",  label: "Facturas",    component: FacturacionScreen },
  { key: "contabilidad", label: "Gastos",      component: ContabilidadScreen },
  { key: "usuarios",     label: "Usuarios",    component: UsuariosScreen },
];

function HeaderRight({ navigation }) {
  const { logout, user, online } = useAuth();

  const confirmLogout = () => {
    Alert.alert("Cerrar sesión", "¿Seguro que desea salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginRight: 14 }}>
      {!online && (
        <View style={{ backgroundColor: "#8B1A1A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>OFFLINE</Text>
        </View>
      )}
      <TouchableOpacity onPress={confirmLogout}>
        <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Salir</Text>
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
        screenOptions={({ route, navigation }) => {
          const tabKey = ALL_TABS.find(t => t.label === route.name)?.key;
          return {
            headerRight: () => <HeaderRight navigation={navigation}/>,
            headerStyle:      { backgroundColor: "#fff" },
            headerTintColor:  colors.text,
            headerTitleStyle: { fontWeight: "700" },
            tabBarActiveTintColor:   colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
            tabBarStyle:      { borderTopColor: colors.border },
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 20 }}>{TAB_ICONS[tabKey] || "●"}</Text>
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
