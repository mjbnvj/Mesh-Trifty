import { handleError, json, methodNotAllowed } from "./_lib/http.js";
import { supabaseRequest } from "./_lib/supabase.js";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  try {
    const products = await supabaseRequest(
      env,
      "products?select=id,name,note,category,tag,image,price,stock&active=eq.true&stock=gt.0&order=id.asc&limit=200"
    );
    const settings = await supabaseRequest(env, "store_settings?select=shipping_fee&id=eq.true&limit=1");
    return json({
      products: products.map(product => ({ ...product, id: Number(product.id), price: Number(product.price), stock: Number(product.stock) })),
      shippingFee: Number(settings[0]?.shipping_fee ?? 0)
    });
  } catch (error) {
    return handleError(error);
  }
}
