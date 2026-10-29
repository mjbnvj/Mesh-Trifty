import { HttpError } from "./http.js";

export function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = String(env.SUPABASE_ANON_KEY || "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(503, "The store backend is not configured.");
  }
  if (parsed.protocol !== "https:" || !anonKey || !serviceKey) {
    throw new HttpError(503, "The store backend is not configured.");
  }
  return { url, anonKey, serviceKey };
}

export async function supabaseRequest(env, path, options = {}) {
  const { url, serviceKey } = supabaseConfig(env);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Accept": "application/json",
      ...(options.body ? { "Content-Type": "application/json", "Prefer": "return=representation" } : {}),
      ...options.headers
    }
  });
  const body = await response.text();
  let result = null;
  if (body) {
    try {
      result = JSON.parse(body);
    } catch {
      throw new HttpError(502, "The store database returned an invalid response.");
    }
  }
  if (!response.ok) {
    const code = result?.code;
    if (code === "P0002") throw new HttpError(404, result.message || "The requested record was not found.");
    if (code === "P0001" || code === "22023") {
      throw new HttpError(400, result.message || "The order details are invalid.");
    }
    console.error("Supabase database request failed.", { status: response.status, code });
    throw new HttpError(502, "The store database could not complete the request.");
  }
  return result;
}

export async function authenticate(request, env) {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) throw new HttpError(401, "Sign in to continue.");

  const { url, anonKey } = supabaseConfig(env);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${match[1]}`
    }
  });
  if (!response.ok) throw new HttpError(401, "Your session expired. Sign in again.");
  const user = await response.json();
  if (!user?.id || !user.email) throw new HttpError(401, "Your session is invalid.");
  return user;
}

export function requireAdmin(user, env) {
  const allowedEmails = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  const email = String(user.email || "").toLowerCase();
  if (!user.email_confirmed_at || !allowedEmails.includes(email)) {
    throw new HttpError(403, "This account is not authorized to access the store admin.");
  }
}

export function requireText(value, label, maxLength) {
  if (typeof value !== "string") throw new HttpError(400, `${label} is required.`);
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new HttpError(400, `${label} is required and must be no more than ${maxLength} characters.`);
  }
  return text;
}

export function requireProductPayload(body) {
  const name = requireText(body.name, "Product name", 120);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const tag = typeof body.tag === "string" ? body.tag.trim() : "";
  const category = requireText(body.category, "Category", 32);
  const image = requireText(body.image, "Image URL", 2048);
  let parsedImage;
  try {
    parsedImage = new URL(image);
  } catch {
    throw new HttpError(400, "Enter a valid HTTP or HTTPS image URL.");
  }
  if (!["http:", "https:"].includes(parsedImage.protocol)) {
    throw new HttpError(400, "Enter a valid HTTP or HTTPS image URL.");
  }
  if (!["Clothing", "Shoes", "Accessories"].includes(category)) {
    throw new HttpError(400, "Choose a valid product category.");
  }
  if (note.length > 255 || tag.length > 40) throw new HttpError(400, "Product note or tag is too long.");
  const price = Number(body.price);
  const stock = Number(body.stock);
  if (!Number.isFinite(price) || price <= 0 || price > 99999999.99 || Math.round(price * 100) / 100 !== price) {
    throw new HttpError(400, "Price must be a positive amount with up to two decimal places.");
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) {
    throw new HttpError(400, "Stock must be a whole number greater than or equal to zero.");
  }
  const payload = { name, note, category, tag, image, price: price.toFixed(2), stock };
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") throw new HttpError(400, "Product status is invalid.");
    payload.active = body.active;
  }
  return payload;
}
