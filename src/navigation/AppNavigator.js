import React from "react";
import { TouchableOpacity, Text, Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../config/roles";
import { colors } from "../config/theme";

import DashboardScreen from "../screens/DashboardScreen";
import InventarioScreen from "../screens/InventarioScreen";
import POSScreen from "../screens/POSScreen";
import FacturacionScreen from "../screens/FacturacionScreen";
import ContabilidadScreen from "../screens/ContabilidadScreen";
import UsuariosScreen from "../screens/UsuariosScreen";

const Tab = createBottomTabNavigator();

// Emojis como íconos hasta que se integre una librería de íconos.
// Reemplazar por <Ionicons> u otra librería cuando esté disponible.
const TAB_ICONS = {
  dashboard: "🏠",
  pos: "🛒",
  inventario: "📦",
  facturacion: "🧾",
  contabilidad: "💰",
  usuarios: "👥",
};

const ALL_TABS = [
  { key: "dashboard", label: "Inicio", component: DashboardScreen },
  { key: "pos", label: "Vender", component: POSScreen },
  { key: "inventario", label: "Inventario", component: InventarioScreen },
  { key: "facturacion", label: "Facturas", component: FacturacionScreen },
  { key: "contabilidad", label: "Gastos", component: ContabilidadScreen },
  { key: "usuarios", label: "Usuarios", component: UsuariosScreen },
];

function LogoutButton() {
  const { logout } = useAuth();
  const confirmLogout = () => {
    Alert.alert("Cerrar sesión", "¿Seguro que desea salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: logout },
    ]);
  };
  return (
    <TouchableOpacity
      onPress={confirmLogout}
      style={{ marginRight: 14 }}
      accessibilityLabel="Cerrar sesión"
      accessibilityRole="button"
    >
      <Text style={{ color: colors.primary, fontWeight: "600" }}>Salir</Text>
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  const { user } = useAuth();
  const perms = ROLES[user.role]?.perms || [];
  const tabs = ALL_TABS.filter((t) => perms.includes(t.key));

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => {
          // Buscar el key correspondiente al label de la ruta
          const tabKey = ALL_TABS.find((t) => t.label === route.name)?.key;
          return {
            headerRight: () => <LogoutButton />,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
            tabBarStyle: { borderTopColor: colors.border },
            // Ícono de la pestaña
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18 }}>{TAB_ICONS[tabKey] || "●"}</Text>
            ),
            headerStyle: { backgroundColor: "#fff" },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700" },
          };
        }}
      >
        {tabs.map((t) => (
          <Tab.Screen key={t.key} name={t.label} component={t.component} />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
