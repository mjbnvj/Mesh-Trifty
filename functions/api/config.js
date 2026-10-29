import { handleError, json, methodNotAllowed } from "./_lib/http.js";
import { supabaseConfig } from "./_lib/supabase.js";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  try {
    const { url, anonKey } = supabaseConfig(env);
    return json({
      supabaseUrl: url,
      supabaseAnonKey: anonKey
    });
  } catch (error) {
    return handleError(error);
  }
}
