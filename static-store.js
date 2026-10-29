import {
  accessToken,
  currentUser,
  getConfig,
  hasMfaAssurance,
  initializeAuth,
  isPasswordRecovery,
  onAuthChange,
  prepareTotpLogin,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updateRecoveredPassword,
  verifyTotpCode
} from "./auth-client.js";

const CART_KEY = "meshtrifty.cart.v1";
const CATEGORIES = {
  Clothing: ["SMALL", "MEDIUM", "LARGE", "XL", "XXL"],
  Shoes: ["39", "40", "41", "42", "43", "44", "45"],
  Accessories: ["MEDIUM", "LARGE"]
};
const FALLBACK_PRODUCTS = [
  { id: 1, name: "UND Devin Booker Edition", note: "Better with age", price: 899, category: "Clothing", tag: "Brand New", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTiqLxvTHKD7Kvj_xoqVRLXnRZVb3JVwZMgaGi2mFp-EZ4hAxq238ayCo4&s=10", stock: 5 },
  { id: 2, name: "A Bathing Ape X Chrome Hearts", note: "Soft cotton · easy fit", price: 1450, category: "Clothing", tag: "Brand New", image: "https://cdn-images.farfetch-contents.com/36/66/92/27/36669227_69424036_600.jpg", stock: 5 },
  { id: 3, name: "UND XMAS Edition", note: "A little worn in, a lot of life", price: 899, category: "Clothing", tag: "Brand New", image: "https://img.lazcdn.com/g/p/b74929f9f9d8c1a16c842943bdce97ae.jpg_720x720q80.jpg", stock: 5 },
  { id: 4, name: "Nike Elite Bag", note: "Room for all your things", price: 1100, category: "Accessories", tag: "Brand New", image: "https://static.nike.com/a/images/t_web_pdp_535_v2/f_auto,u_9ddf04c7-2a9a-4d76-add1-d15af8f0263d,c_scale,fl_relative,w_1.0,h_1.0,fl_layer_apply/9c5b965c-c947-4e31-9cbd-19ce88efc317/NK+VARSITY+ELITE+BKPK.png", stock: 5 },
  { id: 5, name: "New Balance 530", note: "The pair you keep forever", price: 6795, category: "Shoes", tag: "Second Hand", image: "https://i.pinimg.com/736x/16/67/81/16678150e3a456c1b5a1efccc1f33787.jpg", stock: 5 },
  { id: 6, name: "Nike Jordan Sando", note: "Fresh and Clean", price: 199, category: "Clothing", tag: "Brand New", image: "https://static.nike.com/a/images/t_web_pdp_535_v2/f_auto,u_126ab356-44d8-4a06-89b4-fcdcc8df0245,c_scale,fl_relative,w_1.0,h_1.0,fl_layer_apply/084dafbb-4e41-4525-8e8a-fea99b355df2/M+J+SPT+RVRSBL+GFX+JRSY.png", stock: 5 },
  { id: 7, name: "Nike Brasilia", note: "Made in Recycle but Nike Make it Reusable", price: 2699, category: "Accessories", tag: "Brand New", image: "https://static.nike.com/a/images/t_web_pdp_535_v2/f_auto,u_9ddf04c7-2a9a-4d76-add1-d15af8f0263d,c_scale,fl_relative,w_1.0,h_1.0,fl_layer_apply/bbfab902-f382-48f5-944c-e9f4b6878e25/NK+BRSLA+S+DUFF+-+X.png", stock: 5 },
  { id: 8, name: "New Balance U9060", note: "A statement from every angle", price: 9888.8, category: "Shoes", tag: "Second Hand", image: "https://i.pinimg.com/1200x/d5/3c/99/d53c99f62d91bc9615ca6812a6fbd6fc.jpg", stock: 5 }
];

const grid = document.getElementById("product-grid");
const toast = document.getElementById("toast");
const dialogBackdrop = document.getElementById("product-dialog-backdrop");
const cart = new Map();
const wishlist = new Set();
let products = [];
let activeFilter = "All";
let dialogOpener = null;
let selectedProduct = null;
let toastTimeout;
let shippingFee = 100;
let catalogAvailable = false;
let pendingMfa = null;

const money = value => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP"
}).format(Number(value) || 0);

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Accept": "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (path === "/api/orders" || path.startsWith("/api/account/")) {
    headers.Authorization = `Bearer ${await accessToken()}`;
  }
  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The store request could not be completed.");
  return result;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function loadWishlist() {
  try {
    const saved = localStorage.getItem("meshtrifty.wishlist.v1");
    if (!saved) return;
    const ids = JSON.parse(saved);
    if (!Array.isArray(ids)) throw new Error("Saved wishlist data is invalid.");
    ids.forEach(id => {
      const productId = Number(id);
      if (Number.isSafeInteger(productId) && productId > 0) wishlist.add(productId);
    });
  } catch (error) {
    console.error("Could not load the saved MESHTRIFTY wishlist.", error);
    showToast("Saved wishlist data could not be loaded.");
  }
}

function sizesForProduct(product) {
  return CATEGORIES[product.category] || [];
}

function loadShoppingState() {
  try {
    const saved = localStorage.getItem(CART_KEY);
    if (!saved) return;
    const items = JSON.parse(saved);
    if (!Array.isArray(items)) throw new Error("Saved cart data is invalid.");
    items.forEach(item => {
      const product = products.find(candidate => candidate.id === Number(item.productId));
      const quantity = Number(item.quantity);
      if (!product || !sizesForProduct(product).includes(item.size) || !Number.isSafeInteger(quantity) || quantity < 1 || product.stock < 1) return;
      cart.set(`${product.id}:${item.size}`, { product, size: item.size, quantity: Math.min(quantity, product.stock) });
    });
  } catch (error) {
    console.error("Could not load the saved MESHTRIFTY cart.", error);
    showToast("Saved cart data could not be loaded");
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify([...cart.values()].map(item => ({
      productId: item.product.id,
      size: item.size,
      quantity: item.quantity
    }))));
  } catch (error) {
    console.error("Could not save the MESHTRIFTY cart.", error);
    showToast("Cart changes could not be saved in this browser");
  }
}

function renderProducts() {
  const visible = activeFilter === "All"
    ? products
    : products.filter(product => product.category === activeFilter);
  if (!visible.length) {
    grid.innerHTML = '<p class="catalog-message">No products in this category are available right now.</p>';
    return;
  }
  grid.innerHTML = visible.map((product, index) => {
    const isFavorite = wishlist.has(product.id);
    return `
      <article class="product-card" style="animation-delay:${index * 55}ms">
        <div class="product-media">
          <button class="product-view-trigger" type="button" data-view="${product.id}" aria-label="View ${escapeHtml(product.name)} details">
            <img src="${escapeHtml(product.image)}" alt="" loading="lazy">
            <span class="product-view-hint">View item ↗</span>
          </button>
          ${product.tag ? `<span class="product-tag">${escapeHtml(product.tag)}</span>` : ""}
          <button class="favorite${isFavorite ? " active" : ""}" type="button" data-favorite="${product.id}" aria-label="${isFavorite ? "Remove" : "Add"} ${escapeHtml(product.name)} ${isFavorite ? "from" : "to"} wishlist" aria-pressed="${isFavorite}">${isFavorite ? "♥" : "♡"}</button>
          <button class="quick-view" type="button" data-view="${product.id}">View details — ${money(product.price)}</button>
        </div>
        <div class="product-info">
          <div><h3><button class="product-name" type="button" data-view="${product.id}">${escapeHtml(product.name)}</button></h3><p class="product-note">${escapeHtml(product.note)}</p></div>
          <span class="product-price">${money(product.price)}</span>
        </div>
      </article>`;
  }).join("");
}

function setDialogOpen(isOpen) {
  dialogBackdrop.classList.toggle("open", isOpen);
  dialogBackdrop.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("locked", isOpen);
  if (isOpen) document.getElementById("close-product-dialog").focus();
  else if (dialogOpener?.isConnected) dialogOpener.focus();
}

function openProductDialog(product, opener) {
  selectedProduct = product;
  dialogOpener = opener;
  const image = document.getElementById("product-dialog-image");
  image.src = product.image;
  image.alt = product.name;
  document.getElementById("product-dialog-category").textContent = product.category;
  document.getElementById("product-dialog-name").textContent = product.name;
  document.getElementById("product-dialog-price").textContent = money(product.price);
  document.getElementById("product-dialog-note").textContent = product.note;
  document.getElementById("product-stock").textContent = product.stock > 0 ? `${product.stock} available` : "Out of stock";
  const sizes = document.getElementById("product-size");
  sizes.innerHTML = '<option value="">Select a size</option>' + sizesForProduct(product)
    .map(size => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join("");
  const addButton = document.getElementById("product-add-to-cart");
  addButton.disabled = !catalogAvailable || product.stock < 1;
  addButton.textContent = !catalogAvailable ? "Store unavailable" : product.stock > 0 ? "Add to bag" : "Out of stock";
  setDialogOpen(true);
}

function renderCart() {
  const count = [...cart.values()].reduce((total, item) => total + item.quantity, 0);
  const subtotal = [...cart.values()].reduce((total, item) => total + item.product.price * item.quantity, 0);
  document.getElementById("bag-count").textContent = count;
  document.getElementById("drawer-count").textContent = `(${count})`;
  document.getElementById("cart-subtotal").textContent = money(subtotal);
  document.getElementById("checkout-subtotal").textContent = money(subtotal);
  document.getElementById("checkout-shipping").textContent = money(shippingFee);
  document.getElementById("checkout-shipping-total").textContent = money(shippingFee);
  document.getElementById("checkout-total").textContent = money(subtotal + shippingFee);

  const container = document.getElementById("cart-items");
  if (cart.size === 0) {
    container.innerHTML = '<p class="empty-cart">Your bag is empty.<br>Find something lovely to bring home.</p>';
    return;
  }
  container.innerHTML = [...cart.entries()].map(([key, item]) => `
    <article class="cart-item">
      <img src="${escapeHtml(item.product.image)}" alt="">
      <div>
        <h3>${escapeHtml(item.product.name)}</h3><p>${escapeHtml(item.size)} · ${money(item.product.price)}</p>
        <div class="quantity">
          <button type="button" data-quantity="${escapeHtml(key)}" data-delta="-1" aria-label="Remove one ${escapeHtml(item.product.name)}">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-quantity="${escapeHtml(key)}" data-delta="1" aria-label="Add one ${escapeHtml(item.product.name)}" ${item.quantity >= item.product.stock ? "disabled" : ""}>+</button>
        </div>
      </div>
      <span class="cart-item-price">${money(item.product.price * item.quantity)}</span>
    </article>`).join("");
}

function setCartOpen(isOpen) {
  const drawer = document.getElementById("cart-drawer");
  drawer.classList.toggle("open", isOpen);
  document.getElementById("drawer-backdrop").classList.toggle("open", isOpen);
  drawer.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("locked", isOpen || dialogBackdrop.classList.contains("open"));
  if (isOpen) document.getElementById("close-cart").focus();
  else document.getElementById("open-cart").focus();
}

function setAccountOpen(isOpen) {
  const backdrop = document.getElementById("account-backdrop");
  backdrop.classList.toggle("open", isOpen);
  backdrop.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("locked", isOpen || document.getElementById("cart-drawer").classList.contains("open"));
  if (isOpen) document.getElementById("close-account").focus();
  else document.getElementById("open-account").focus();
}

function setCheckoutOpen(isOpen) {
  const backdrop = document.getElementById("checkout-backdrop");
  backdrop.classList.toggle("open", isOpen);
  backdrop.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("locked", isOpen || document.getElementById("cart-drawer").classList.contains("open"));
  if (isOpen) document.getElementById("checkout-name").focus();
  else document.getElementById("open-cart").focus();
}

function setAuthMode(mode) {
  const isRegister = mode === "register";
  document.getElementById("account-name-field").hidden = !isRegister;
  document.getElementById("account-name").required = isRegister;
  document.getElementById("account-password").autocomplete = isRegister ? "new-password" : "current-password";
  document.getElementById("account-password").minLength = isRegister ? 12 : 1;
  document.getElementById("password-guidance").hidden = !isRegister;
  document.getElementById("account-submit").textContent = isRegister ? "Create account" : "Sign in";
  document.getElementById("forgot-password").hidden = isRegister;
  document.getElementById("register-tab").classList.toggle("active", isRegister);
  document.getElementById("signin-tab").classList.toggle("active", !isRegister);
  document.getElementById("register-tab").setAttribute("aria-selected", String(isRegister));
  document.getElementById("signin-tab").setAttribute("aria-selected", String(!isRegister));
  document.getElementById("account-error").textContent = "";
}

function renderAuth() {
  const user = currentUser();
  document.getElementById("account-label").textContent = user?.user_metadata?.full_name?.split(/\s+/)[0] || user?.email?.split("@")[0] || "Sign in";
  document.getElementById("account-intro").textContent = user
    ? `Signed in as ${user.email}`
    : "Sign in or create an account to see your orders and check out.";
  document.getElementById("account-form").hidden = Boolean(user);
  document.getElementById("account-profile").hidden = !user;
  document.getElementById("sign-out").hidden = !user;
  document.querySelector(".account-tabs").hidden = Boolean(user);
  if (user) {
    pendingMfa = null;
    document.getElementById("mfa-panel").hidden = true;
    loadAccountOrders();
  }
}

function renderMfaQr(qrCode) {
  const image = document.getElementById("mfa-qr");
  if (typeof qrCode !== "string") throw new Error("The authenticator QR code is unavailable.");
  if (qrCode.startsWith("data:image/svg+xml")) {
    image.src = qrCode;
  } else if (qrCode.trimStart().startsWith("<svg")) {
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`;
  } else {
    throw new Error("The authenticator QR code has an invalid format.");
  }
  image.hidden = false;
}

async function beginMfaGate() {
  const result = await prepareTotpLogin();
  if (result.status === "verified") {
    pendingMfa = null;
    renderAuth();
    return true;
  }

  pendingMfa = result;
  document.getElementById("account-form").hidden = true;
  document.getElementById("recovery-password-form").hidden = true;
  document.querySelector(".account-tabs").hidden = true;
  document.getElementById("account-profile").hidden = true;
  document.getElementById("sign-out").hidden = true;
  document.getElementById("mfa-panel").hidden = false;
  document.getElementById("mfa-error").textContent = "";
  document.getElementById("mfa-manual-key").textContent = "";
  document.getElementById("mfa-manual-key").hidden = true;
  document.getElementById("mfa-manual-label").hidden = true;
  document.getElementById("mfa-qr").hidden = true;
  document.getElementById("mfa-intro").textContent = result.status === "enroll"
    ? "Set up Google Authenticator (or another TOTP app). Scan this QR code, or enter the setup key, then verify the six-digit code."
    : "Enter the six-digit code from your authenticator app to finish signing in.";
  if (result.status === "enroll") {
    renderMfaQr(result.qrCode);
    document.getElementById("mfa-manual-label").hidden = false;
    document.getElementById("mfa-manual-key").hidden = false;
    document.getElementById("mfa-manual-key").textContent = result.secret;
  }
  setAccountOpen(true);
  document.getElementById("mfa-code").focus();
  return false;
}

async function loadAccountOrders() {
  const container = document.getElementById("account-orders");
  container.innerHTML = '<p class="product-note">Loading your orders…</p>';
  try {
    const { orders } = await api("/api/orders");
    if (!orders.length) {
      container.innerHTML = '<p class="product-note">You have no orders yet.</p>';
      return;
    }
    container.innerHTML = orders.map(order => `
      <article class="account-order">
        <div class="account-order-head"><strong>${escapeHtml(order.order_number)}</strong><strong>${money(order.total)}</strong></div>
        <p class="product-note">${escapeHtml(new Date(order.created_at).toLocaleString())} · ${escapeHtml(order.status)} · Cash on delivery</p>
        <p class="product-note">${(order.order_items || []).map(item => `${escapeHtml(item.product_name)} (${escapeHtml(item.size)}) × ${Number(item.quantity)}`).join(", ")}</p>
      </article>`).join("");
  } catch (error) {
    container.innerHTML = `<p class="account-error">${escapeHtml(error.message)}</p>`;
  }
}

async function submitAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = document.getElementById("account-submit");
  const error = document.getElementById("account-error");
  const mode = document.getElementById("register-tab").classList.contains("active") ? "register" : "signin";
  error.textContent = "";
  submit.disabled = true;
  try {
    const email = document.getElementById("account-email").value.trim().toLowerCase();
    const password = document.getElementById("account-password").value;
    if (mode === "register") {
      const result = await signUp({ name: document.getElementById("account-name").value.trim(), email, password });
      form.reset();
      if (result.needsEmailConfirmation) {
        error.textContent = "Check your email and confirm your account. You'll return here to set up your authenticator.";
      } else {
        if (await beginMfaGate()) {
          setAccountOpen(false);
          showToast("Your account is ready.");
        }
      }
    } else {
      await signIn(email, password);
      form.reset();
      if (await beginMfaGate()) {
        setAccountOpen(false);
        showToast("You are signed in.");
        if (isPasswordRecovery()) showRecoveryPasswordForm();
      }
    }
  } catch (requestError) {
    const mfaError = document.getElementById("mfa-panel").hidden ? null : document.getElementById("mfa-error");
    (mfaError || error).textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
}

document.getElementById("mfa-code-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !pendingMfa) return;
  const submit = document.getElementById("mfa-verify");
  const error = document.getElementById("mfa-error");
  submit.disabled = true;
  error.textContent = "";
  try {
    await verifyTotpCode(pendingMfa.factorId, pendingMfa.challengeId, document.getElementById("mfa-code").value);
    pendingMfa = null;
    form.reset();
    document.getElementById("mfa-panel").hidden = true;
    renderAuth();
    setAccountOpen(false);
    showToast("Two-factor sign-in complete.");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

function showRecoveryPasswordForm() {
  document.getElementById("recovery-password-form").hidden = false;
  document.getElementById("account-form").hidden = true;
  document.querySelector(".account-tabs").hidden = true;
  document.getElementById("account-profile").hidden = true;
  document.getElementById("sign-out").hidden = true;
  setAccountOpen(true);
  document.getElementById("recovery-password").focus();
}

async function submitOrder(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  if (!cart.size) {
    showToast("Your bag is empty.");
    return;
  }
  const user = currentUser();
  if (!user) {
    setCheckoutOpen(false);
    setAuthMode("signin");
    setAccountOpen(true);
    showToast("Sign in before placing your order.");
    return;
  }

  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const error = document.getElementById("checkout-error");
  submit.disabled = true;
  error.textContent = "";
  const data = new FormData(form);
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: {
        name: String(data.get("name")).trim(),
        email: String(data.get("email")).trim(),
        address: String(data.get("address")).trim(),
        city: String(data.get("city")).trim(),
        postal: String(data.get("postal")).trim(),
        items: [...cart.values()].map(item => ({
          product_id: item.product.id,
          size: item.size,
          quantity: item.quantity
        }))
      }
    });
    cart.clear();
    saveCart();
    renderCart();
    document.getElementById("checkout-form").hidden = true;
    document.getElementById("order-success").hidden = false;
    document.getElementById("order-confirmation").textContent = `${result.order.order_number} · ${money(result.order.total)} · Cash on delivery`;
    await loadProducts();
    loadAccountOrders();
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
}

async function loadProducts() {
  try {
    const result = await api("/api/products");
    catalogAvailable = true;
    products = result.products.map(product => ({
      ...product,
      id: Number(product.id),
      price: Number(product.price),
      stock: Number(product.stock)
    }));
    shippingFee = Number(result.shippingFee);
    renderProducts();
    loadShoppingState();
    renderCart();
  } catch (error) {
    console.error("Could not load MESHTRIFTY products.", error);
    catalogAvailable = false;
    products = FALLBACK_PRODUCTS.map(product => ({ ...product, stock: 0 }));
    renderProducts();
    document.getElementById("catalog-notice").hidden = false;
    document.getElementById("catalog-notice").textContent = "Showing sample products because the live catalog could not be reached. Orders are unavailable until the store backend is configured.";
    renderCart();
  }
}

document.getElementById("filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("active", chip === button));
  renderProducts();
});

document.querySelectorAll("[data-category-link]").forEach(link => {
  link.addEventListener("click", () => {
    activeFilter = link.dataset.categoryLink;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("active", chip.dataset.filter === activeFilter));
    renderProducts();
  });
});

grid.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    const product = products.find(item => item.id === Number(viewButton.dataset.view));
    if (product) openProductDialog(product, viewButton);
    return;
  }
  const favorite = event.target.closest("[data-favorite]");
  if (!favorite) return;
  const id = Number(favorite.dataset.favorite);
  if (wishlist.has(id)) wishlist.delete(id);
  else wishlist.add(id);
  try {
    localStorage.setItem("meshtrifty.wishlist.v1", JSON.stringify([...wishlist]));
  } catch (error) {
    console.error("Could not save the MESHTRIFTY wishlist.", error);
    showToast("Wishlist changes could not be saved.");
  }
  renderProducts();
  grid.querySelector(`[data-favorite="${id}"]`)?.focus();
});

document.getElementById("close-product-dialog").addEventListener("click", () => setDialogOpen(false));
dialogBackdrop.addEventListener("click", event => {
  if (event.target === dialogBackdrop) setDialogOpen(false);
});

document.getElementById("product-add-to-cart").addEventListener("click", () => {
  if (!selectedProduct) return;
  const size = document.getElementById("product-size").value;
  if (!size) {
    document.getElementById("product-size").focus();
    showToast("Choose a size before adding this item.");
    return;
  }
  const key = `${selectedProduct.id}:${size}`;
  const existing = cart.get(key);
  if ((existing?.quantity || 0) >= selectedProduct.stock) {
    showToast("There is not enough stock available.");
    return;
  }
  cart.set(key, { product: selectedProduct, size, quantity: (existing?.quantity || 0) + 1 });
  saveCart();
  renderCart();
  setDialogOpen(false);
  showToast("Added to your bag.");
});

document.getElementById("cart-items").addEventListener("click", event => {
  const button = event.target.closest("[data-quantity]");
  if (!button) return;
  const key = button.dataset.quantity;
  const item = cart.get(key);
  if (!item) return;
  const quantity = item.quantity + Number(button.dataset.delta);
  if (quantity < 1) cart.delete(key);
  else if (quantity <= item.product.stock) cart.set(key, { ...item, quantity });
  else showToast("There is not enough stock available.");
  saveCart();
  renderCart();
});

document.getElementById("open-cart").addEventListener("click", () => setCartOpen(true));
document.getElementById("close-cart").addEventListener("click", () => setCartOpen(false));
document.getElementById("drawer-backdrop").addEventListener("click", () => setCartOpen(false));
document.getElementById("open-account").addEventListener("click", () => setAccountOpen(true));
document.getElementById("close-account").addEventListener("click", () => setAccountOpen(false));
document.getElementById("account-backdrop").addEventListener("click", event => {
  if (event.target === event.currentTarget) setAccountOpen(false);
});
document.getElementById("register-tab").addEventListener("click", () => setAuthMode("register"));
document.getElementById("signin-tab").addEventListener("click", () => setAuthMode("signin"));
document.getElementById("account-form").addEventListener("submit", submitAccount);
setAuthMode("signin");

document.getElementById("forgot-password").addEventListener("click", async () => {
  const error = document.getElementById("account-error");
  const email = document.getElementById("account-email").value.trim().toLowerCase();
  if (!email || !document.getElementById("account-email").checkValidity()) {
    document.getElementById("account-email").focus();
    error.textContent = "Enter a valid email address first.";
    return;
  }
  try {
    await requestPasswordReset(email);
    error.textContent = "If an account exists for that email, a password reset link is on its way.";
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.getElementById("recovery-password-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const error = document.getElementById("recovery-password-error");
  try {
    await updateRecoveredPassword(document.getElementById("recovery-password").value);
    form.reset();
    form.hidden = true;
    if (currentUser()) {
      renderAuth();
    } else {
      document.getElementById("account-form").hidden = false;
      document.querySelector(".account-tabs").hidden = false;
      setAuthMode("signin");
    }
    setAccountOpen(true);
    showToast(currentUser() ? "Your password has been updated." : "Password updated. Sign in with your new password.");
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

document.getElementById("sign-out").addEventListener("click", async () => {
  try {
    await signOut();
    setAccountOpen(false);
    showToast("You are signed out.");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("refresh-account-orders").addEventListener("click", loadAccountOrders);
document.getElementById("checkout-button").addEventListener("click", () => {
  if (cart.size === 0) {
    showToast("Your bag is empty.");
    return;
  }
  setCartOpen(false);
  document.getElementById("checkout-form").hidden = false;
  document.getElementById("order-success").hidden = true;
  document.getElementById("checkout-name").value = currentUser()?.user_metadata?.full_name || "";
  document.getElementById("checkout-email").value = currentUser()?.email || "";
  renderCart();
  setCheckoutOpen(true);
});
document.getElementById("close-checkout").addEventListener("click", () => setCheckoutOpen(false));
document.getElementById("checkout-backdrop").addEventListener("click", event => {
  if (event.target === event.currentTarget) setCheckoutOpen(false);
});
document.getElementById("checkout-form").addEventListener("submit", submitOrder);
document.getElementById("checkout-done").addEventListener("click", () => setCheckoutOpen(false));

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (dialogBackdrop.classList.contains("open")) setDialogOpen(false);
  if (document.getElementById("cart-drawer").classList.contains("open")) setCartOpen(false);
  if (document.getElementById("account-backdrop").classList.contains("open")) setAccountOpen(false);
  if (document.getElementById("checkout-backdrop").classList.contains("open")) setCheckoutOpen(false);
});

document.getElementById("menu-button").addEventListener("click", event => {
  const nav = document.getElementById("site-nav");
  const isOpen = nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(isOpen));
  event.currentTarget.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  event.currentTarget.textContent = isOpen ? "×" : "☰";
});
document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    document.getElementById("site-nav").classList.remove("open");
    const menuButton = document.getElementById("menu-button");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
    menuButton.textContent = "☰";
  });
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  document.querySelectorAll(".reveal").forEach(element => observer.observe(element));
} else {
  document.querySelectorAll(".reveal").forEach(element => element.classList.add("visible"));
}

onAuthChange(renderAuth);
loadWishlist();
renderAuth();
if (isPasswordRecovery()) {
  showRecoveryPasswordForm();
  setAccountOpen(true);
}
initializeAuth().then(async user => {
  if (user && !hasMfaAssurance() && !isPasswordRecovery()) {
    try {
      await beginMfaGate();
    } catch (error) {
      console.error("Could not start authenticator verification.", error);
      showToast("Two-factor authentication could not be started.");
    }
  }
  if (isPasswordRecovery()) showRecoveryPasswordForm();
}).catch(error => {
  console.error("Could not initialize the account service.", error);
  showToast("Account service is unavailable.");
});
getConfig().catch(error => {
  console.error("Could not load the store configuration.", error);
});
loadProducts();
