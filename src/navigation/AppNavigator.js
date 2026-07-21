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

// Un módulo = una pestaña. Solo se muestran las que el rol del usuario
// tiene permitidas (mismo mapeo que backend y frontend web).
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
    <TouchableOpacity onPress={confirmLogout} style={{ marginRight: 14 }}>
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
        screenOptions={{
          headerRight: () => <LogoutButton />,
          tabBarActiveTintColor: colors.primary,
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        {tabs.map((t) => (
          <Tab.Screen key={t.key} name={t.label} component={t.component} />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
