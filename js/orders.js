/**
 * Real-Time Order Tracking for Users
 */

import { auth, db } from './firebase.js';
import { collection, query, where, orderBy, onSnapshot, getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { formatCurrency } from './utils.js';

let currentUser = null;
let ordersUnsubscribe = null;

// Auth State
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setupAuthLinks();
        updateBottomNav();
        listenToUserOrders(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// Setup Auth Links
async function setupAuthLinks() {
    const authLinks = document.getElementById('auth-links');
    if (currentUser) {
        authLinks.innerHTML = `
            <a href="index.html" class="nav-menu-link">Home</a>
            <a href="orders.html" class="nav-menu-link active">Orders</a>
            <a href="cart.html" class="nav-menu-link">Cart</a>
            <a href="profile.html" class="nav-menu-link">Account</a>
            <a href="#" class="nav-menu-link" onclick="auth.signOut(); return false;">Logout</a>
        `;
    } else {
        authLinks.innerHTML = `
            <a href="login.html" class="nav-menu-link">Login</a>
            <a href="signup.html" class="nav-menu-link">Sign Up</a>
        `;
    }
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
        <a href="cart.html" class="bottom-nav-item">
            <i data-lucide="shopping-cart"></i>
            <span>Cart</span>
        </a>
        <a href="orders.html" class="bottom-nav-item active">
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

// Real-Time Order Listener
function listenToUserOrders(userId) {
    const ordersRef = collection(db, 'orders');
    // Removed orderBy to avoid index issues; sorting client-side instead
    const q = query(
        ordersRef,
        where('userId', '==', userId)
    );

    ordersUnsubscribe = onSnapshot(q, (snapshot) => {
        let orders = [];
        snapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });

        // Client-side sorting: newest first
        orders.sort((a, b) => {
            const dateA = a.orderDate?.toDate() || a.createdAt?.toDate() || new Date(0);
            const dateB = b.orderDate?.toDate() || b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });

        renderOrders(orders);
    }, (error) => {
        console.error('Error listening to orders:', error);
        document.getElementById('orders-list').innerHTML = `
            <div class="empty-state">
                <p>Error loading orders. Please refresh the page.</p>
            </div>
        `;
    });
}

// Render Orders
function renderOrders(orders) {
    const container = document.getElementById('orders-list');

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>No Orders Yet</h3>
                <p>Start shopping and place your first order!</p>
                <a href="index.html" class="btn">Browse Menu</a>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map(order => createOrderCard(order)).join('');
}

// Render Order Progress Visual
function renderOrderProgress(status) {
    const statuses = ['pending', 'accepted', 'preparing', 'ready', 'completed'];
    const statusIndex = statuses.indexOf(status);

    if (status === 'cancelled') {
        return `
            <div class="order-progress cancelled">
                <i data-lucide="x-circle" style="vertical-align: middle; margin-right: 8px;"></i>
                Order Cancelled
            </div>
        `;
    }

    const getIcon = (stepStatus) => {
        const icons = {
            'pending': 'file-text',
            'accepted': 'user-check',
            'preparing': 'flame',
            'ready': 'package',
            'completed': 'check-circle'
        };
        return icons[stepStatus] || 'circle';
    };

    const steps = statuses.map((s, idx) => {
        const isActive = statusIndex >= idx;
        const isCurrent = status === s;
        return `
            <div class="progress-step ${isActive ? 'active' : ''} ${isCurrent ? 'current-step' : ''}">
                <div class="step-icon">
                    <i data-lucide="${getIcon(s)}"></i>
                </div>
                <div class="step-label">${getStatusText(s)}</div>
            </div>
            ${idx < statuses.length - 1 ? `<div class="progress-line ${statusIndex > idx ? 'active' : ''}"></div>` : ''}
        `;
    }).join('');

    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 10);

    return `
        <div class="tracking-header">
            <span style="font-weight: 700; color: var(--gray-700);">Tracking Status</span>
            <div class="live-indicator">
                <div class="live-dot"></div>
                LIVE UPDATES
            </div>
        </div>
        <div class="order-progress">
            ${steps}
        </div>
    `;
}

// Create Order Card
function createOrderCard(order) {
    const timestamp = order.orderDate || order.createdAt;
    const orderDate = timestamp?.toDate ?
        timestamp.toDate().toLocaleDateString('en-PK', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) :
        'Just now';

    return `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <div class="order-id">Order #${order.id.slice(-6).toUpperCase()}</div>
                    <div class="order-date">Placed on ${orderDate}</div>
                </div>
            </div>

            ${order.vendorOrders ? order.vendorOrders.map(vendorOrder => {
        // Fallback for missing vendorName in old data
        const displayShopName = vendorOrder.vendorName && vendorOrder.vendorName !== 'Unknown Shop'
            ? vendorOrder.vendorName
            : (vendorOrder.items?.[0]?.shopName || 'Premium Food Partner');

        return `
                <div class="vendor-section">
                    <div class="vendor-info-header">
                        <span class="vendor-name">
                            <i data-lucide="store" style="width:18px; vertical-align:middle; margin-right:4px;"></i>
                            ${displayShopName}
                        </span>
                        <span class="status-badge status-${vendorOrder.status}">
                            ${getStatusText(vendorOrder.status)}
                        </span>
                    </div>
                    
                    ${renderOrderProgress(vendorOrder.status)}

                    <div class="order-items">
                        ${vendorOrder.items.map(item => `
                            <div class="order-item">
                                <span>${item.quantity || item.qty}x ${item.name}</span>
                                <span>${formatCurrency(item.price * (item.quantity || item.qty))}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="vendor-footer">
                        Subtotal: ${formatCurrency(vendorOrder.subtotal)}
                    </div>
                </div>
            `;
    }).join('') : `
                <div class="vendor-section">
                    <div class="vendor-info-header">
                        <span class="vendor-name">
                            <i data-lucide="package" style="width:18px; vertical-align:middle; margin-right:4px;"></i>
                            Legacy Order
                        </span>
                        <span class="status-badge status-completed">Completed</span>
                    </div>
                    <div class="order-items">
                        ${order.items ? order.items.map(item => `
                            <div class="order-item">
                                <span>${item.qty || 1}x ${item.name}</span>
                                <span>${formatCurrency(item.price * (item.qty || 1))}</span>
                            </div>
                        `).join('') : '<p>No items found</p>'}
                    </div>
                </div>
            `}

            <div class="order-summary-footer">
                <div class="order-total-row">
                    <span>Total Amount Paid:</span>
                    <span class="order-total">${formatCurrency(order.totalPrice)}</span>
                </div>
                <div class="payment-method">
                    <span>Payment Method:</span>
                    <span>${order.paymentMethod || 'Cash on Delivery'}</span>
                </div>
            </div>
        </div>
    `;
}

// Get Status Text
function getStatusText(status) {
    const statusMap = {
        'pending': 'Pending',
        'accepted': 'Accepted',
        'preparing': 'Preparing',
        'ready': 'Ready',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
    };
    return statusMap[status] || status;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ordersUnsubscribe) {
        ordersUnsubscribe();
    }
});
