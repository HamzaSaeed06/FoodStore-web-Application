import { auth, db } from '../js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { logoutUser } from '../js/auth.js';
import { collection, query, where, getDocs, setDoc, addDoc, doc, deleteDoc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, toggleLoading, getFormData, formatCurrency } from '../js/utils.js';

// Real-Time Order Management
let ordersUnsubscribe = null;
let vendorOrders = [];

// Listen to vendor orders
export function listenToVendorOrders(vendorId) {
    const ordersRef = collection(db, 'orders');

    ordersUnsubscribe = onSnapshot(ordersRef, (snapshot) => {
        vendorOrders = [];

        snapshot.forEach(orderDoc => {
            const orderData = { id: orderDoc.id, ...orderDoc.data() };
            const myVendorOrders = orderData.vendorOrders?.filter(vo => vo.vendorId === vendorId);

            if (myVendorOrders && myVendorOrders.length > 0) {
                vendorOrders.push({ ...orderData, vendorOrders: myVendorOrders });
            }
        });

        renderVendorOrders();
        updateOrderBadge();
        if (window.lucide) window.lucide.createIcons();
    });
}

// Render orders
function renderVendorOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    if (vendorOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-orders-modern">
                <i data-lucide="package" class="empty-state-icon-large"></i>
                <h3>No Orders Yet</h3>
                <p>Orders will appear here when customers start buying!</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const sorted = [...vendorOrders].sort((a, b) => {
        const dateA = a.orderDate?.toDate?.() || new Date(0);
        const dateB = b.orderDate?.toDate?.() || new Date(0);
        return dateB - dateA;
    });

    container.innerHTML = sorted.map(order => {
        return order.vendorOrders.map(vo => createOrderCard(order, vo)).join('');
    }).join('');
}

// Create order card
function createOrderCard(order, vendorOrder) {
    const orderDate = order.orderDate?.toDate ?
        order.orderDate.toDate().toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) :
        'Just now';

    return `
        <div class="order-form-card" data-status="${vendorOrder.status}">
            <!-- Form Header: Order ID & Status -->
            <div class="form-header">
                <div class="order-id-section">
                    <span class="form-label">ORDER ID</span>
                    <h4 class="form-value">#${order.id.slice(-6).toUpperCase()}</h4>
                </div>
                <span class="form-status-badge status-${vendorOrder.status}">
                    ${getStatusText(vendorOrder.status)}
                </span>
            </div>

            <!-- Section 1: Customer Information -->
            <div class="form-section">
                <h5 class="section-title"><i data-lucide="user" class="section-icon"></i> Customer Information</h5>
                <div class="form-grid">
                    <div class="form-field">
                        <span class="field-label">Customer Name</span>
                        <span class="field-value highlight-text">${order.userName}</span>
                    </div>
                    <div class="form-field">
                        <span class="field-label">Contact Number</span>
                        <span class="field-value">${order.userPhone || 'Not Provided'}</span>
                    </div>
                    <div class="form-field full-width">
                        <span class="field-label">Delivery Address</span>
                        <span class="field-value address-text">${order.userAddress || 'Self-Pickup'}</span>
                    </div>
                </div>
            </div>

            <!-- Section 2: Order Items -->
            <div class="form-section">
                <h5 class="section-title"><i data-lucide="shopping-bag" class="section-icon"></i> Order Details</h5>
                <div class="order-items-list">
                    ${vendorOrder.items.map(item => `
                        <div class="form-item-row">
                            <div class="item-snapshot-square">
                                <img src="${item.imageUrl || '../assets/default-food.png'}" 
                                     onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop'"
                                     alt="${item.name}">
                            </div>
                            <div class="item-info">
                                <span class="item-name">${item.name}</span>
                                <span class="item-meta-info">Quantity: <strong>${item.quantity}</strong> | Price: ${formatCurrency(item.price)}</span>
                            </div>
                            <div class="item-total-price">
                                ${formatCurrency(item.price * item.quantity)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Form Footer: Totals & Actions -->
            <div class="form-footer">
                <div class="order-summary">
                    <div class="summary-row">
                        <span>Items Count:</span>
                        <strong>${vendorOrder.items.reduce((sum, i) => sum + i.quantity, 0)}</strong>
                    </div>
                    <div class="summary-row total-highlight">
                        <span>Total Payable:</span>
                        <span class="grand-total">${formatCurrency(vendorOrder.subtotal)}</span>
                    </div>
                    <div class="summary-row date-row">
                        <i data-lucide="calendar" style="width:12px;"></i>
                        <span>Order Date: ${orderDate}</span>
                    </div>
                </div>
                <div class="form-actions">
                    ${getOrderActions(order.id, vendorOrder)}
                </div>
            </div>
        </div>
    `;
}

// Get order actions
function getOrderActions(orderId, vendorOrder) {
    const actions = {
        'pending': `<button class="btn-accept" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'accepted')"><i data-lucide="check-circle" style="width:18px;"></i> Accept Order</button>`,
        'accepted': `<button class="btn-prepare" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'preparing')"><i data-lucide="cooking-pot" style="width:18px;"></i> Start Preparing</button>`,
        'preparing': `<button class="btn-ready" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'ready')"><i data-lucide="package-check" style="width:18px;"></i> Mark Ready</button>`,
        'ready': `<button class="btn-complete" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'completed')"><i data-lucide="file-check-2" style="width:18px;"></i> Complete Order</button>`
    };
    return actions[vendorOrder.status] || '';
}

// Get status text
function getStatusText(status) {
    const map = { 'pending': 'Pending', 'accepted': 'Accepted', 'preparing': 'Preparing', 'ready': 'Ready', 'completed': 'Completed', 'cancelled': 'Cancelled' };
    return map[status] || status;
}

// Update badge
function updateOrderBadge() {
    const badge = document.getElementById('newOrdersBadge');
    if (!badge) return;

    const pendingCount = vendorOrders.reduce((count, order) => {
        return count + order.vendorOrders.filter(vo => vo.status === 'pending').length;
    }, 0);

    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

// Update order status (global function)
window.updateOrderStatus = async function (orderId, vendorId, newStatus) {
    try {
        const orderRef = doc(db, 'orders', orderId);
        const orderDoc = await getDoc(orderRef);

        if (!orderDoc.exists()) {
            showToast('Order not found', 'error');
            return;
        }

        const orderData = orderDoc.data();
        const updatedVendorOrders = orderData.vendorOrders.map(vo => {
            if (vo.vendorId === vendorId) {
                return { ...vo, status: newStatus, updatedAt: new Date() };
            }
            return vo;
        });

        await updateDoc(orderRef, { vendorOrders: updatedVendorOrders });
        showToast(`Order ${newStatus}!`, 'success');

    } catch (error) {
        console.error('Error updating order:', error);
        showToast('Failed to update order', 'error');
    }
};

// Export for cleanup
export function cleanupOrderListener() {
    if (ordersUnsubscribe) {
        ordersUnsubscribe();
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupOrderListener);
