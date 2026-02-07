import { auth, db } from '../js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { logoutUser } from '../js/auth.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { formatCurrency } from '../js/utils.js';

// DOM Elements
const orderList = document.getElementById('order-list');
const logoutBtn = document.getElementById('logoutBtn');

// Init Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await loadOrders(user.uid);
    }
});

// Load Orders
async function loadOrders(uid) {
    orderList.innerHTML = '<p>Loading your orders...</p>';

    try {
        // Note: 'orderBy' requires an index if mixed with 'where'. 
        // For simplicity, we might drop orderBy if index is missing, or user needs to create it.
        // We will try without orderBy first or catch/warn. 
        // Requirement: "Proper comments".
        const q = query(
            collection(db, "orders"),
            where("userId", "==", uid)
            // orderBy("createdAt", "desc") // Requires index
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            orderList.innerHTML = '<div class="card"><p>No orders yet! <a href="../index.html" style="color:red">Go Shop</a></p></div>';
            return;
        }

        orderList.innerHTML = '';
        querySnapshot.forEach((doc) => {
            renderOrderCard(doc.data());
        });

    } catch (error) {
        console.error("Orders Error:", error);
        orderList.innerHTML = `<p style="color:red">Error loading orders. (Check console)</p>`;
    }
}

// Render Order
function renderOrderCard(data) {
    const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';

    // Formatting Items
    const itemsHtml = data.items.map(item => `
        <li>${item.name} x ${item.qty} - ${formatCurrency(item.price * item.qty)}</li>
    `).join('');

    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = `
        <div class="order-header">
            <span><strong>Order ID:</strong> ${data.orderId || '...'}</span>
            <span>${date}</span>
        </div>
        <div class="order-items">
            <ul>${itemsHtml}</ul>
        </div>
        <div style="margin-top:10px; text-align:right;">
            Total: <span class="total-price">${formatCurrency(data.totalPrice)}</span>
        </div>
    `;

    orderList.appendChild(card);
}

// Logout
logoutBtn.addEventListener('click', logoutUser);
