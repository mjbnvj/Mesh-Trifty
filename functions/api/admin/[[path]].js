import { handleError, HttpError, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { authenticate, requireAdmin, requireProductPayload, requireText, supabaseRequest } from "../_lib/supabase.js";

const PRODUCT_COLUMNS = "id,name,note,category,tag,image,price,stock,active,created_at,updated_at";

export async function onRequest({ request, env }) {
  try {
    const user = await authenticate(request, env);
    requireAdmin(user, env);
    const routePath = new URL(request.url).pathname.replace(/^\/api\/admin\/?/, "");
    const path = routePath
      .split("/")
      .filter(Boolean);
    const resource = path.join("/");

    if (resource === "dashboard" && request.method === "GET") {
      const [products, orders, settings] = await Promise.all([
        supabaseRequest(env, `products?select=${PRODUCT_COLUMNS}&order=id.desc&limit=500`),
        supabaseRequest(env, "orders?select=id,order_number,customer_name,email,address,city,postal,payment_method,subtotal,shipping_fee,total,status,created_at,order_items(id,product_name,size,price,quantity)&order=created_at.desc&limit=500"),
        supabaseRequest(env, "store_settings?select=shipping_fee&id=eq.true&limit=1")
      ]);
      return json({ products, orders, shippingFee: Number(settings[0]?.shipping_fee ?? 0) });
    }

    if (resource === "products" && request.method === "POST") {
      const body = await readJson(request);
      const payload = requireProductPayload(body);
      const rows = await supabaseRequest(env, "products?select=" + PRODUCT_COLUMNS, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return json({ product: rows[0] }, 201);
    }

    if (path[0] === "products" && path.length === 2 && request.method === "PATCH") {
      const id = Number(path[1]);
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Choose a valid product.");
      const body = await readJson(request);
      let payload;
      if (body.operation === "set_active") {
        if (typeof body.active !== "boolean") throw new HttpError(400, "Product status is invalid.");
        payload = { active: body.active, updated_at: new Date().toISOString() };
      } else {
        payload = { ...requireProductPayload(body), updated_at: new Date().toISOString() };
      }
      const rows = await supabaseRequest(env, `products?id=eq.${id}&select=${PRODUCT_COLUMNS}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      if (!rows.length) throw new HttpError(404, "Product not found.");
      return json({ product: rows[0] });
    }

    if (resource === "settings" && request.method === "PATCH") {
      const body = await readJson(request);
      const shippingFee = Number(body.shippingFee);
      if (!Number.isFinite(shippingFee) || shippingFee < 0 || shippingFee > 999999 || Math.round(shippingFee * 100) / 100 !== shippingFee) {
        throw new HttpError(400, "Enter a valid shipping fee with up to two decimal places.");
      }
      const rows = await supabaseRequest(env, "store_settings?id=eq.true&select=shipping_fee", {
        method: "PATCH",
        body: JSON.stringify({ shipping_fee: shippingFee.toFixed(2) })
      });
      if (!rows.length) throw new HttpError(500, "Store shipping settings could not be saved.");
      return json({ shippingFee: Number(rows[0].shipping_fee) });
    }

    if (path[0] === "orders" && path.length === 2 && request.method === "PATCH") {
      const id = requireText(path[1], "Order ID", 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new HttpError(400, "Choose a valid order.");
      }
      const body = await readJson(request);
      const status = requireText(body.status, "Order status", 24);
      if (!["Pending", "Processing", "Shipped", "Completed", "Cancelled"].includes(status)) {
        throw new HttpError(400, "Choose a valid order status.");
      }
      const order = await supabaseRequest(env, "rpc/set_order_status", {
        method: "POST",
        body: JSON.stringify({ p_order_id: id, p_status: status })
      });
      return json({ order });
    }

    if (!["GET", "POST", "PATCH"].includes(request.method)) return methodNotAllowed("GET, POST, PATCH");
    throw new HttpError(404, "Admin resource not found.");
  } catch (error) {
    return handleError(error);
  }
}
