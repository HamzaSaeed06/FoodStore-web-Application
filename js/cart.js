import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, getDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, formatCurrency, toggleLoading } from './utils.js';
import { logoutUser } from './auth.js';

// DOM Elements
const authLinks = document.getElementById('auth-links');
const cartItemsContainer = document.getElementById('cart-items-container');
const checkoutArea = document.getElementById('checkout-area');
const totalDisplay = document.getElementById('cart-total-display');
const checkoutBtn = document.getElementById('final-checkout-btn');
const phoneInput = document.getElementById('checkout-phone');
const addressInput = document.getElementById('checkout-address');

// State
let cart = JSON.parse(localStorage.getItem('foodStoreCart')) || [];
let currentUser = null;

// Init
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    setupAuthLinks();
    updateBottomNav();

    if (user) {
        // Pre-fill user data if available
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            phoneInput.value = data.phoneNumber || '';
            addressInput.value = data.defaultAddress || '';
        }
    }

    renderCart();
});

function setupAuthLinks() {
    if (!authLinks) return;

    authLinks.innerHTML = `
        <a href="index.html" class="nav-menu-link">Home</a>
        <a href="orders.html" class="nav-menu-link">Orders</a>
        <a href="cart.html" class="nav-menu-link active">Cart</a>
        <a href="profile.html" class="nav-menu-link">Account</a>
        <a href="#" class="nav-menu-link" id="navLogoutBtn">Logout</a>
    `;

    const logoutBtn = document.getElementById('navLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);
    if (window.lucide) lucide.createIcons();
}

function updateBottomNav() {
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (!bottomNav) return;

    bottomNav.innerHTML = `
        <a href="index.html" class="bottom-nav-item">
            <i data-lucide="home"></i>
            <span>Home</span>
        </a>
        <a href="cart.html" class="bottom-nav-item active">
            <i data-lucide="shopping-cart"></i>
            <span>Cart</span>
        </a>
        <a href="orders.html" class="bottom-nav-item">
            <i data-lucide="package"></i>
            <span>Orders</span>
        </a>
        <a href="profile.html" class="bottom-nav-item">
            <i data-lucide="user"></i>
            <span>Account</span>
        </a>
    `;
    if (window.lucide) lucide.createIcons();
}

function renderCart() {
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart">
                <div class="empty-icon">🛒</div>
                <h2>Your cart is empty</h2>
                <p>Add some delicious food to your cart and come back!</p>
                <a href="index.html" class="btn" style="margin-top:20px;">Browse Menu</a>
            </div>
        `;
        checkoutArea.style.display = 'none';
        return;
    }

    checkoutArea.style.display = 'block';

    cartItemsContainer.innerHTML = cart.map((item, idx) => `
        <div class="cart-item-card">
            <img src="${item.imageUrl}" alt="${item.name}" class="cart-item-img">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>${item.category} • ${item.vendorName || 'FoodStore Partner'}</p>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQty(${idx}, -1)"><i data-lucide="minus" style="width:14px;"></i></button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty(${idx}, 1)"><i data-lucide="plus" style="width:14px;"></i></button>
                </div>
            </div>
            <div class="cart-item-price">
                <span class="price-tag">${formatCurrency(item.price * item.qty)}</span>
                <button class="remove-btn" onclick="removeFromCart(${idx})">
                    <i data-lucide="trash-2" style="width:18px;"></i>
                </button>
            </div>
        </div>
    `).join('');

    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    totalDisplay.textContent = formatCurrency(total);

    if (window.lucide) lucide.createIcons();
}

window.updateQty = function (index, change) {
    if (cart[index]) {
        cart[index].qty += change;
        if (cart[index].qty <= 0) {
            cart.splice(index, 1);
        }
        saveCart();
    }
}

window.removeFromCart = function (index) {
    cart.splice(index, 1);
    saveCart();
}

function saveCart() {
    localStorage.setItem('foodStoreCart', JSON.stringify(cart));
    renderCart();
}

// Checkout Logic
checkoutBtn.addEventListener('click', async () => {
    if (cart.length === 0) return;

    if (!currentUser) {
        showToast("Please login to place order", "error");
        setTimeout(() => window.location.href = "login.html", 1500);
        return;
    }

    if (!phoneInput.value || !addressInput.value) {
        showToast("Please provide delivery phone and address", "warning");
        return;
    }

    toggleLoading(checkoutBtn, true, 'Processing...');

    try {
        const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

        // Group items by vendor
        const vendorOrdersMap = {};

        for (const item of cart) {
            const vendorId = item.vendorId || 'unknown';
            const vendorName = item.vendorName || 'Unknown Shop';

            if (!vendorOrdersMap[vendorId]) {
                vendorOrdersMap[vendorId] = {
                    vendorId: vendorId,
                    vendorName: vendorName,
                    items: [],
                    subtotal: 0,
                    status: 'pending',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            }

            vendorOrdersMap[vendorId].items.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.qty,
                category: item.category || ''
            });

            vendorOrdersMap[vendorId].subtotal += item.price * item.qty;
        }

        const vendorOrders = Object.values(vendorOrdersMap);

        await addDoc(collection(db, "orders"), {
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email || 'Customer',
            userEmail: currentUser.email,
            userPhone: phoneInput.value,
            userAddress: addressInput.value,
            vendorOrders: vendorOrders,
            totalPrice: total,
            orderDate: serverTimestamp(),
            paymentMethod: 'Cash on Delivery'
        });

        // Clear Cart
        cart = [];
        saveCart();

        showToast("Order placed successfully!", "success");
        setTimeout(() => window.location.href = "orders.html", 1500);

    } catch (error) {
        console.error("Order Error:", error);
        showToast("Failed to place order: " + error.message, "error");
    } finally {
        toggleLoading(checkoutBtn, false, 'Place Order');
    }
});
