// Debe coincidir exactamente con el backend y la web
export const ROLES = {
  admin: {
    label: "Administrador",
    color: "#8B1A1A",
    perms: ["dashboard", "inventario", "pos", "facturacion", "contabilidad", "usuarios", "config"],
  },
  cajero: {
    label: "Cajero",
    color: "#1A5C8B",
    perms: ["dashboard", "pos", "facturacion"],
  },
  contador: {
    label: "Contador",
    color: "#1A7A3C",
    perms: ["dashboard", "contabilidad"],
  },
  almacenista: {
    label: "Almacenista",
    color: "#7A5C1A",
    perms: ["dashboard", "inventario"],
  },
};

export const PAY_METHODS = [
  { id: "efectivo",      label: "Efectivo CUP" },
  { id: "transferencia", label: "Transferencia (Zun/Enzona)" },
];

export const CAN_MANAGE_INVENTORY = ["admin", "almacenista"];
