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
    });
}

// Render orders
function renderVendorOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    if (vendorOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-orders">
                <div style="font-size: 4rem; margin-bottom: 16px;">📦</div>
                <h3>No Orders Yet</h3>
                <p>Orders will appear here in real-time</p>
            </div>
        `;
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
        <div class="order-card" data-status="${vendorOrder.status}">
            <div class="order-card-header">
                <div>
                    <h4>Order #${order.id.slice(-6).toUpperCase()}</h4>
                    <p class="customer-name">👤 ${order.userName}</p>
                    <p class="customer-name" style="font-size: 0.8rem; color: var(--primary-color);">📞 ${order.userPhone || 'No Phone'}</p>
                    <p class="customer-name" style="font-size: 0.8rem; background: #fff5f5; padding: 4px 8px; border-radius: 6px; margin-top: 4px;">📍 ${order.userAddress || 'No Address'}</p>
                    <p class="customer-name" style="font-size: 0.8rem; margin-top: 4px;">📅 ${orderDate}</p>
                </div>
                <span class="status-badge status-${vendorOrder.status}">
                    ${getStatusText(vendorOrder.status)}
                </span>
            </div>
            <div class="order-items">
                ${vendorOrder.items.map(item => `
                    <div class="order-item">
                        <span>${item.quantity}x ${item.name}</span>
                        <span>${formatCurrency(item.price * item.quantity)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="order-footer">
                <strong>Total: ${formatCurrency(vendorOrder.subtotal)}</strong>
                <div class="order-actions">
                    ${getOrderActions(order.id, vendorOrder)}
                </div>
            </div>
        </div>
    `;
}

// Get order actions
function getOrderActions(orderId, vendorOrder) {
    const actions = {
        'pending': `<button class="btn-accept" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'accepted')">✓ Accept</button>`,
        'accepted': `<button class="btn-prepare" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'preparing')">🍳 Start Preparing</button>`,
        'preparing': `<button class="btn-ready" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'ready')">✓ Mark Ready</button>`,
        'ready': `<button class="btn-complete" onclick="updateOrderStatus('${orderId}', '${vendorOrder.vendorId}', 'completed')">✓ Complete</button>`
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
