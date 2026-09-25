// ─── UUID v4 (clientSaleId) ────────────────────────────────────────────────
// El identificador de venta lo genera el DISPOSITIVO y viaja al backend como
// idempotency key: si la app se cae a mitad del sync y reintenta, el servidor
// reconoce la venta y devuelve la factura ORIGINAL en vez de duplicarla.
//
// No usamos expo-crypto (dependencia nativa extra): basta con
// crypto.getRandomValues cuando el runtime lo expone y un fallback PRNG
// determinista-safe en el resto. Los ids localmente no son secretos, solo
// tienen que ser únicos por dispositivo.

type CryptoLike = { getRandomValues?: (a: Uint8Array) => Uint8Array; randomUUID?: () => string };

function getCrypto(): CryptoLike | null {
  const g = globalThis as unknown as { crypto?: CryptoLike };
  return g && g.crypto ? g.crypto : null;
}

export function generateUuid(): string {
  const c = getCrypto();
  if (c?.randomUUID) {
    try {
      return c.randomUUID();
    } catch {
      // seguimos con el fallback
    }
  }

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4: version 4, variante 10xx
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-` +
    `${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
  );
}

// Formato UUID v4 (8-4-4-4-12). El backend valida el formato antes de usarlo
// como idempotency key; si una venta vieja viniera sin clientSaleId válido,
// el cliente genera uno nuevo en vez de romper el lote.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
