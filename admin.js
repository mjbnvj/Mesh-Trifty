import {
  accessToken,
  currentUser,
  initializeAuth,
  signIn,
  signOut
} from "./auth-client.js";

const ORDER_STATUSES = ["Pending", "Processing", "Shipped", "Completed", "Cancelled"];
let products = [];
let orders = [];
let shippingFee = 100;
let toastTimer;

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const formatDate = value => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Accept": "application/json", "Authorization": `Bearer ${await accessToken()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The admin request could not be completed.");
  return result;
}

function toast(message, isError = false) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
}

function changeSection(section) {
  ["overview", "products", "orders", "settings"].forEach(name => {
    document.getElementById(`${name}-section`).hidden = name !== section;
  });
  document.querySelectorAll(".nav-button").forEach(button => {
    button.classList.toggle("active", button.dataset.section === section);
  });
  document.getElementById("page-title").textContent = section[0].toUpperCase() + section.slice(1);
}

function renderOverview() {
  document.getElementById("stat-products").textContent = products.filter(product => product.active && Number(product.stock) > 0).length;
  document.getElementById("stat-orders").textContent = orders.length;
  document.getElementById("stat-pending").textContent = orders.filter(order => order.status === "Pending").length;
  document.getElementById("stat-sales").textContent = money(orders
    .filter(order => order.status !== "Cancelled")
    .reduce((sum, order) => sum + Number(order.total), 0));
  const latest = orders.slice(0, 6);
  document.getElementById("recent-orders").innerHTML = latest.length ? latest.map(order => `
    <tr>
      <td><strong>${escapeHtml(order.order_number)}</strong></td>
      <td>${escapeHtml(order.customer_name)}<div class="muted">${escapeHtml(order.email)}</div></td>
      <td>${escapeHtml(formatDate(order.created_at))}</td>
      <td>${money(order.total)}</td>
      <td><span class="badge ${order.status === "Cancelled" ? "off" : order.status === "Pending" ? "" : "live"}">${escapeHtml(order.status)}</span></td>
    </tr>`).join("") : '<tr><td class="empty" colspan="5">No orders have been placed yet.</td></tr>';
}

function renderProducts() {
  const query = document.getElementById("product-search").value.trim().toLowerCase();
  const filter = document.getElementById("product-filter").value;
  const visible = products.filter(product => {
    const matchesText = `${product.name} ${product.category} ${product.tag || ""}`.toLowerCase().includes(query);
    const matchesState = filter === "all" ||
      (filter === "active" && product.active) ||
      (filter === "inactive" && !product.active) ||
      (filter === "low" && Number(product.stock) <= 5);
    return matchesText && matchesState;
  });
  document.getElementById("products-table").innerHTML = visible.length ? visible.map(product => `
    <tr>
      <td><div class="product-cell"><img src="${escapeHtml(product.image)}" alt=""><div><strong>${escapeHtml(product.name)}</strong><div class="muted">${escapeHtml(product.tag || product.note || "—")}</div></div></div></td>
      <td>${escapeHtml(product.category)}</td>
      <td>${money(product.price)}</td>
      <td>${Number(product.stock)}</td>
      <td><span class="badge ${product.active && Number(product.stock) > 0 ? "live" : "off"}">${product.active && Number(product.stock) > 0 ? "Active" : "Hidden"}</span></td>
      <td><div class="row-actions"><button type="button" data-edit="${Number(product.id)}">Edit</button><button type="button" data-active="${Number(product.id)}" data-next="${!product.active}">${product.active ? "Hide" : "Publish"}</button></div></td>
    </tr>`).join("") : '<tr><td class="empty" colspan="6">No products match your search.</td></tr>';
}

function allowedStatuses(status) {
  if (status === "Pending") return ["Pending", "Processing", "Cancelled"];
  if (status === "Processing") return ["Processing", "Shipped", "Cancelled"];
  if (status === "Shipped") return ["Shipped", "Completed"];
  return [status];
}

function renderOrders() {
  const query = document.getElementById("order-search").value.trim().toLowerCase();
  const filter = document.getElementById("order-filter").value;
  const visible = orders.filter(order => {
    const search = `${order.order_number} ${order.customer_name} ${order.email} ${order.address} ${order.city}`.toLowerCase().includes(query);
    return search && (filter === "all" || order.status === filter);
  });
  document.getElementById("orders-table").innerHTML = visible.length ? visible.map(order => `
    <tr>
      <td><strong>${escapeHtml(order.order_number)}</strong></td>
      <td>${escapeHtml(order.customer_name)}<div class="muted">${escapeHtml(order.email)}<br>${escapeHtml(order.address)}, ${escapeHtml(order.city)} ${escapeHtml(order.postal)}</div></td>
      <td>${escapeHtml(formatDate(order.created_at))}</td>
      <td>${escapeHtml(order.payment_method)}</td>
      <td>${money(order.total)}</td>
      <td><select class="status-select" data-order="${escapeHtml(order.id)}" aria-label="Status for ${escapeHtml(order.order_number)}" ${["Completed", "Cancelled"].includes(order.status) ? "disabled" : ""}>
        ${allowedStatuses(order.status).map(status => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
      </select></td>
    </tr>`).join("") : '<tr><td class="empty" colspan="6">No orders match your search.</td></tr>';
}

async function loadDashboard() {
  const error = document.getElementById("load-error");
  error.hidden = true;
  try {
    const result = await api("/api/admin/dashboard");
    products = result.products.map(product => ({ ...product, id: Number(product.id), price: Number(product.price), stock: Number(product.stock), active: Boolean(product.active) }));
    orders = result.orders;
    shippingFee = Number(result.shippingFee);
    document.getElementById("shipping-fee").value = shippingFee.toFixed(2);
    renderOverview();
    renderProducts();
    renderOrders();
    document.getElementById("login-screen").hidden = true;
    document.getElementById("admin-shell").hidden = false;
    document.getElementById("admin-email").textContent = currentUser()?.email || "";
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
    throw requestError;
  }
}

function openProductForm(product = null) {
  const form = document.getElementById("product-form");
  form.reset();
  form.elements.id.value = product ? product.id : "";
  document.getElementById("modal-title").textContent = product ? "Edit product" : "Add product";
  document.getElementById("product-error").textContent = "";
  if (product) {
    ["name", "category", "tag", "price", "stock", "image", "note"].forEach(field => {
      form.elements[field].value = product[field] ?? "";
    });
  }
  document.getElementById("product-modal").hidden = false;
  form.elements.name.focus();
}

function closeProductForm() {
  document.getElementById("product-modal").hidden = true;
}

document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[type="submit"]');
  const error = document.getElementById("login-error");
  submit.disabled = true;
  error.textContent = "";
  try {
    await signIn(document.getElementById("login-email").value.trim().toLowerCase(), document.getElementById("login-password").value);
    await loadDashboard();
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelectorAll(".nav-button").forEach(button => {
  button.addEventListener("click", () => changeSection(button.dataset.section));
});
document.querySelectorAll("[data-goto]").forEach(button => {
  button.addEventListener("click", () => changeSection(button.dataset.goto));
});
document.getElementById("refresh-button").addEventListener("click", () => {
  loadDashboard().catch(error => toast(error.message, true));
});
document.getElementById("logout-button").addEventListener("click", async () => {
  try {
    await signOut();
    window.location.reload();
  } catch (error) {
    toast(error.message, true);
  }
});
document.getElementById("product-search").addEventListener("input", renderProducts);
document.getElementById("product-filter").addEventListener("change", renderProducts);
document.getElementById("order-search").addEventListener("input", renderOrders);
document.getElementById("order-filter").addEventListener("change", renderOrders);
document.getElementById("add-product").addEventListener("click", () => openProductForm());
document.getElementById("close-modal").addEventListener("click", closeProductForm);
document.getElementById("cancel-modal").addEventListener("click", closeProductForm);
document.getElementById("product-modal").addEventListener("click", event => {
  if (event.target === event.currentTarget) closeProductForm();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeProductForm();
});

document.getElementById("product-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[type="submit"]');
  const error = document.getElementById("product-error");
  const data = Object.fromEntries(new FormData(form).entries());
  const id = data.id;
  const body = {
    name: data.name,
    category: data.category,
    tag: data.tag,
    price: Number(data.price),
    stock: Number(data.stock),
    image: data.image,
    note: data.note
  };
  submit.disabled = true;
  error.textContent = "";
  try {
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PATCH" : "POST",
      body
    });
    closeProductForm();
    await loadDashboard();
    toast("Product saved.");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("products-table").addEventListener("click", async event => {
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    const product = products.find(item => item.id === Number(edit.dataset.edit));
    if (product) openProductForm(product);
    return;
  }
  const active = event.target.closest("[data-active]");
  if (!active) return;
  active.disabled = true;
  try {
    await api(`/api/admin/products/${encodeURIComponent(active.dataset.active)}`, {
      method: "PATCH",
      body: { operation: "set_active", active: active.dataset.next === "true" }
    });
    await loadDashboard();
    toast(active.dataset.next === "true" ? "Product published." : "Product hidden.");
  } catch (error) {
    toast(error.message, true);
    active.disabled = false;
  }
});

document.getElementById("orders-table").addEventListener("change", async event => {
  const select = event.target.closest("[data-order]");
  if (!select) return;
  const order = orders.find(item => item.id === select.dataset.order);
  const oldStatus = order?.status || "Pending";
  select.disabled = true;
  try {
    const result = await api(`/api/admin/orders/${encodeURIComponent(select.dataset.order)}`, {
      method: "PATCH",
      body: { status: select.value }
    });
    if (order) order.status = result.order.status;
    renderOverview();
    renderOrders();
    toast("Order status updated.");
  } catch (error) {
    select.value = oldStatus;
    toast(error.message, true);
  } finally {
    select.disabled = false;
  }
});

document.getElementById("settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const error = document.getElementById("settings-error");
  const submit = form.querySelector('[type="submit"]');
  error.textContent = "";
  submit.disabled = true;
  try {
    const result = await api("/api/admin/settings", {
      method: "PATCH",
      body: { shippingFee: Number(document.getElementById("shipping-fee").value) }
    });
    shippingFee = Number(result.shippingFee);
    toast("Shipping fee saved.");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

const user = await initializeAuth();
if (user) {
  await loadDashboard().catch(error => {
    document.getElementById("login-error").textContent = error.message;
  });
}
