import { handleError, HttpError, json, methodNotAllowed, readJson } from "./_lib/http.js";
import { authenticate, supabaseConfig, supabaseRequest, requireText } from "./_lib/supabase.js";

export async function onRequest({ request, env }) {
  try {
    if (request.method === "GET") {
      const user = await authenticate(request, env);
      const query = new URLSearchParams({
        select: "id,order_number,customer_name,email,address,city,postal,payment_method,subtotal,shipping_fee,total,status,created_at,order_items(id,product_name,size,price,quantity)",
        user_id: `eq.${user.id}`,
        order: "created_at.desc",
        limit: "50"
      });
      const orders = await supabaseRequest(env, `orders?${query}`);
      return json({ orders });
    }

    if (request.method !== "POST") return methodNotAllowed("GET, POST");
    const user = await authenticate(request, env);
    if (!user.email_confirmed_at) throw new HttpError(403, "Confirm your email address before placing an order.");
    const body = await readJson(request);
    const name = requireText(body.name, "Full name", 80);
    const email = requireText(body.email, "Email address", 254).toLowerCase();
    if (!/^[^\s@]+@[^.\s@]+(?:\.[^.\s@]+)+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    const address = requireText(body.address, "Delivery address", 120);
    const city = requireText(body.city, "City", 60);
    const postal = requireText(body.postal, "Postal code", 20);
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
      throw new HttpError(400, "Your cart is empty or too large.");
    }
    const items = body.items.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new HttpError(400, "Your cart contains an invalid item.");
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      const size = requireText(item.size, "Size", 16);
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new HttpError(400, "Your cart contains an invalid quantity.");
      }
      return { product_id: productId, size, quantity };
    });
    const unique = new Set(items.map(item => `${item.product_id}:${item.size}`));
    if (unique.size !== items.length) throw new HttpError(400, "Remove duplicate item rows from your cart and try again.");

    const order = await supabaseRequest(env, "rpc/place_cod_order", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: user.id,
        p_customer_name: name,
        p_email: email,
        p_address: address,
        p_city: city,
        p_postal: postal,
        p_items: items
      })
    });
    return json({ order }, 201);
  } catch (error) {
    return handleError(error);
  }
}
