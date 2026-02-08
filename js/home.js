import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, formatCurrency, toggleLoading, checkAccountCompleteness } from './utils.js';
import { logoutUser } from './auth.js';

// DOM Elements
const authLinks = document.getElementById('auth-links');
const itemsGrid = document.getElementById('items-grid');
const categoryFilter = document.getElementById('category-filter');

// State
let allItems = [];
let cart = JSON.parse(localStorage.getItem('foodStoreCart')) || [];
let currentUser = null;

// Init
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    await updateNav(user);
    if (user) {
        checkAccountCompleteness(user, db);
    }
});

async function updateNav(user) {
    if (user) {
        authLinks.innerHTML = `
            <a href="index.html" class="nav-menu-link active">Home</a>
            <a href="orders.html" class="nav-menu-link">Track Order</a>
            <a href="cart.html" class="nav-menu-link" id="cart-menu-link">Cart</a>
            <a href="profile.html" class="nav-menu-link">Account</a>
        `;
    } else {
        authLinks.innerHTML = `
            <a href="login.html" class="nav-menu-link">Login</a>
            <a href="signup.html" class="nav-menu-link">Sign Up</a>
        `;
    }
    if (window.lucide) lucide.createIcons();
    updateBottomNav(user);
}

function updateBottomNav(user) {
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (!bottomNav) return;

    if (user) {
        bottomNav.innerHTML = `
            <a href="index.html" class="bottom-nav-item active">
                <i data-lucide="home"></i>
                <span>Home</span>
            </a>
            <a href="cart.html" class="bottom-nav-item">
                <i data-lucide="shopping-cart"></i>
                <span id="bottom-cart-badge-container"></span>
                <span>Cart</span>
            </a>
            <a href="orders.html" class="bottom-nav-item">
                <i data-lucide="package"></i>
                <span>Track Order</span>
            </a>
            <a href="profile.html" class="bottom-nav-item" id="bottomDashboardBtn">
                <i data-lucide="user"></i>
                <span>Account</span>
            </a>
        `;

        // No need for click listener, direct href is better
    } else {
        bottomNav.innerHTML = `
            <a href="index.html" class="bottom-nav-item active">
                <i data-lucide="home"></i>
                <span>Home</span>
            </a>
            <a href="login.html" class="bottom-nav-item">
                <i data-lucide="log-in"></i>
                <span>Login</span>
            </a>
        `;
    }
    if (window.lucide) lucide.createIcons();
}

// 1. Fetch Verified Items
async function loadItems() {
    showSkeletonLoading();

    try {
        // Step 1: Get Verified Vendors
        // Optimization: In a real app, we'd replicate 'isVerified' to shops or items.
        // Here we fetch all verified users first.
        const usersQ = query(collection(db, "users"), where("role", "==", "vendor"), where("isVerified", "==", true));
        const usersSnap = await getDocs(usersQ);
        const verifiedVendorIds = usersSnap.docs.map(d => d.id);

        if (verifiedVendorIds.length === 0) {
            itemsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-category);">No verified vendors yet.</p>';
            return;
        }

        // Step 2: Get Shops owned by these vendors
        const shopsSnap = await getDocs(collection(db, "shops"));
        const verifiedShopIds = [];
        const shopNamesMap = {}; // To store shop names for each shop ID

        shopsSnap.forEach(doc => {
            const shop = doc.data();
            if (verifiedVendorIds.includes(shop.vendorId) && shop.isActive) {
                verifiedShopIds.push(doc.id);
                shopNamesMap[doc.id] = shop.shopName || shop.name || 'Unknown Shop';
            }
        });

        if (verifiedShopIds.length === 0) {
            itemsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-category);">No active shops found.</p>';
            return;
        }

        // Step 3: Fetch Items from these shops
        const itemsSnap = await getDocs(collection(db, "items"));
        allItems = [];
        itemsSnap.forEach(doc => {
            const data = doc.data();
            if (verifiedShopIds.includes(data.shopId)) {
                allItems.push({
                    id: doc.id,
                    ...data,
                    vendorName: shopNamesMap[data.shopId] // Attach shop name
                });
            }
        });

        renderItems(allItems);
        updateCartCount();

    } catch (error) {
        console.error("Load Error:", error);
        itemsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger-color);">Error loading items. Please refresh the page.</p>';
    }
}

// 2. Render Items with Professional Cards
function renderItems(items) {
    if (items.length === 0) {
        itemsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--color-category);">
                <p style="font-size: 1.2rem; font-family: var(--font-main);">No items match your filter.</p>
                <p style="margin-top: 10px;">Try selecting a different category.</p>
            </div>
        `;
        return;
    }

    itemsGrid.innerHTML = '';
    items.forEach(item => {
        const card = createFoodCard(item);
        itemsGrid.appendChild(card);
    });
}

// Production-Ready Food Card Component
function createFoodCard(item) {
    const card = document.createElement('article');
    card.className = 'card food-card';
    card.setAttribute('data-item-id', item.id);

    // Check if item already in cart
    const inCart = cart.some(c => c.id === item.id);

    card.innerHTML = `
        <div class="food-card__image-wrapper">
            <img 
                src="${item.imageUrl}" 
                alt="${item.name}"
                class="food-card__image"
                loading="lazy"
                onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=450&fit=crop'"
            >
            <span class="food-card__badge">${item.category}</span>
        </div>
        <div class="food-card__content">
            <div class="food-card__vendor">
                <i data-lucide="store" style="width: 14px; height: 14px;"></i>
                <span>${item.vendorName || 'FoodStore Partner'}</span>
            </div>
            <h3 class="food-card__title">${escapeHtml(item.name)}</h3>
            <div class="food-card__footer">
                <div class="food-card__price-tag">
                    <span class="food-card__price-label">Starting from</span>
                    <span class="food-card__price">${formatCurrency(item.price)}</span>
                </div>
                <button 
                    class="food-card__button"
                    aria-label="Add to cart"
                    ${inCart ? 'disabled' : ''}
                >
                    ${inCart ? '<i data-lucide="check-circle" style="width:18px;"></i> Added' : '<i data-lucide="shopping-cart" style="width:18px;"></i> Add'}
                </button>
            </div>
        </div>
    `;

    // Event delegation: Add to cart handler
    const button = card.querySelector('.food-card__button');
    button.addEventListener('click', () => addToCart(item));

    if (window.lucide) lucide.createIcons();

    return card;
}

// Helper: Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Show Skeleton Loading State
function showSkeletonLoading() {
    itemsGrid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'card food-card';
        skeleton.innerHTML = `
            <div class="food-card__image-wrapper loading"></div>
            <div class="food-card__content">
                <div style="height: 24px; background: #f0f0f0; border-radius: 4px; margin-bottom: 12px;"></div>
                <div style="height: 44px; background: #f0f0f0; border-radius: 8px;"></div>
            </div>
        `;
        itemsGrid.appendChild(skeleton);
    }
}

// 3. Filter
window.filterCategory = function (cat) {
    if (cat === 'All') {
        renderItems(allItems);
    } else {
        const filtered = allItems.filter(i => i.category === cat);
        renderItems(filtered);
    }

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
};

// 4. Cart Logic
function addToCart(item) {
    const existing = cart.find(x => x.id === item.id);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ ...item, qty: 1 });
    }
    saveCart();
    showToast(`${item.name} added to cart!`);
}

function saveCart() {
    localStorage.setItem('foodStoreCart', JSON.stringify(cart));
    updateCartCount();
}

function updateCartCount() {
    const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
    const cartMenuLink = document.getElementById('cart-menu-link');
    if (cartMenuLink) {
        cartMenuLink.innerHTML = `Cart (${totalQty})`;
    }

    // Update bottom nav badge
    const bottomBadgeContainer = document.getElementById('bottom-cart-badge-container');
    if (bottomBadgeContainer) {
        bottomBadgeContainer.innerHTML = totalQty > 0 ? `<span class="badge">${totalQty}</span>` : '';
    }

    if (window.lucide) lucide.createIcons();
}

// Run
loadItems();
