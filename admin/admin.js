import { db, auth } from '../js/firebase.js';
import { collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logoutUser } from '../js/auth.js';
import { showToast } from '../js/utils.js';
import { initRouteGuard } from '../js/routeGuard.js';

// Initialize Route Guard (Protect this page)
initRouteGuard(['admin']);

const vendorTableBody = document.getElementById('vendorTableBody');
const logoutBtn = document.getElementById('logoutBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.admin-sidebar');

// Sidebar Toggle
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

// Close sidebar when clicking outside on mobile (optional UX improvement)
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !sidebarToggle.contains(e.target) &&
        sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
});

// logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        console.log("Logout clicked");
        await logoutUser();
    });
} else {
    console.error("Logout Button Not Found!");
}

// Real-time listener for Vendors
function initVendorListener() {
    const q = query(collection(db, "users"), where("role", "==", "vendor"));

    onSnapshot(q, (snapshot) => {
        vendorTableBody.innerHTML = '';

        if (snapshot.empty) {
            vendorTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 30px;">No vendors found.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const vendor = docSnap.data();
            const row = document.createElement('tr');

            // Determine Status Badge
            const statusBadge = vendor.isVerified
                ? `<span class="badge badge-verified"><ion-icon name="checkmark-circle"></ion-icon> Verified</span>`
                : `<span class="badge badge-pending"><ion-icon name="time"></ion-icon> Pending</span>`;

            // Determine Online Indicator
            const isOnline = vendor.isOnline === true; // Strict check
            const onlineIndicator = isOnline
                ? `<div class="status-indicator status-online"><div class="dot"></div> Online</div>`
                : `<div class="status-indicator status-offline"><div class="dot"></div> Offline</div>`;

            // Verification Button Text
            const actionBtn = vendor.isVerified
                ? `<button class="action-btn btn-reject" onclick="toggleVerification('${docSnap.id}', false)">Revoke Access</button>`
                : `<button class="action-btn btn-approve" onclick="toggleVerification('${docSnap.id}', true)">Approve Vendor</button>`;

            row.innerHTML = `
                <td data-label="Vendor">
                    <div class="shop-info">
                        ${vendor.email}
                        <small>UID: ${vendor.uid.substring(0, 8)}...</small>
                    </div>
                </td>
                <td data-label="Status">${statusBadge}</td>
                <td data-label="Online">${onlineIndicator}</td>
                <td data-label="Actions">${actionBtn}</td>
            `;
            vendorTableBody.appendChild(row);
        });
    }, (error) => {
        console.error("Error fetching vendors:", error);
        vendorTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Error loading data.</td></tr>`;
    });
}

// Global function for button click (attached to window because of module scope)
window.toggleVerification = async (uid, newStatus) => {
    try {
        const vendorRef = doc(db, "users", uid);
        await updateDoc(vendorRef, {
            isVerified: newStatus
        });
        showToast(`Vendor ${newStatus ? 'Approved' : 'Revoked'}`, "success");
    } catch (error) {
        console.error("Error updating status:", error);
        showToast("Update failed", "error");
    }
};

// Initialize
initVendorListener();
