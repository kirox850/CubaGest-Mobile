import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = "https://cubagest-backend-production.up.railway.app/api";
const TOKEN_KEY = "cubagest_token";
const USER_KEY  = "cubagest_user";

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token) {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export async function getCachedUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setCachedUser(user) {
  if (user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export async function apiFetch(path, opts = {}) {
  const { method = "GET", body, auth = true } = opts;

  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (!token) throw new Error("No autenticado");
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Sin conexión");
    throw e;
  }
}
