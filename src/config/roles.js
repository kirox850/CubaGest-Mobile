// Debe coincidir exactamente con src/config/roles.js del backend
// y con el objeto ROLES del frontend web (cubagest.tsx).
export const ROLES = {
  admin: { label: "Administrador", color: "#8B1A1A", perms: ["dashboard", "inventario", "pos", "facturacion", "contabilidad", "usuarios"] },
  cajero: { label: "Cajero", color: "#1A5C8B", perms: ["dashboard", "pos", "facturacion"] },
  contador: { label: "Contador", color: "#1A7A3C", perms: ["dashboard", "contabilidad", "facturacion"] },
  almacenista: { label: "Almacenista", color: "#7A5C1A", perms: ["dashboard", "inventario"] },
};
