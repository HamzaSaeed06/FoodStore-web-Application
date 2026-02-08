import { auth, db } from '../js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { logoutUser } from '../js/auth.js';
import { collection, query, where, getDocs, setDoc, addDoc, doc, deleteDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, toggleLoading, getFormData, formatCurrency } from '../js/utils.js';
import { listenToVendorOrders, cleanupOrderListener } from './vendor-orders.js';


const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/ds05q0lls/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "mypreset";

// DOM Elements
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.admin-sidebar');
const logoutBtn = document.getElementById('logoutBtn');
const dashboardContent = document.getElementById('dashboard-content');

// Shop Form Elements
const shopForm = document.getElementById('shopForm');
const categorySelect = document.getElementById('categorySelect');
const customCategoryInput = document.getElementById('customCategoryInput');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const categoryContainer = document.getElementById('categoryContainer');
const finalCategoryList = document.getElementById('finalCategoryList');

// View/Edit Mode Toggle
const shopViewMode = document.getElementById('shopViewMode');
const shopEditMode = document.getElementById('shopEditMode');
const editProfileBtn = document.getElementById('editProfileBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

editProfileBtn?.addEventListener('click', () => {
    shopViewMode.style.display = 'none';
    shopEditMode.style.display = 'block';
});

cancelEditBtn?.addEventListener('click', () => {
    shopEditMode.style.display = 'none';
    shopViewMode.style.display = 'block';
});

// Update View Mode with Shop Data
function updateShopView() {
    if (currentShop) {
        const shopPic = document.querySelector('#shopProfilePic img');
        if (shopPic && currentShop.imageUrl) shopPic.src = currentShop.imageUrl;

        document.getElementById('viewShopName').textContent = currentShop.shopName || 'Shop Name';

        const viewCategoriesDiv = document.getElementById('viewCategories');
        if (currentShop.categoryList && currentShop.categoryList.length > 0) {
            viewCategoriesDiv.innerHTML = currentShop.categoryList.map(cat => `<span class="cat-chip">${cat}</span>`).join('');
        } else {
            viewCategoriesDiv.innerHTML = '<span class="cat-chip" style="background: #f1f3f5; color: #636e72;">No categories</span>';
        }
    }
}

const shopImageInput = document.getElementById('shopImageInput');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const removeImageBtn = document.getElementById('removeImageBtn');

// Item Modal Image Elements
const itemUploadArea = document.getElementById('itemUploadArea');
const itemImageInput = document.getElementById('itemImageInput');
const itemImagePreview = document.getElementById('itemImagePreview');
const itemPreviewImg = document.getElementById('itemPreviewImg');
const itemRemoveImageBtn = document.getElementById('itemRemoveImageBtn');
const itemUploadPlaceholder = document.getElementById('itemUploadPlaceholder');

// State
let currentUser = null;
let currentShop = null;
let shopCategories = [];
let uploadedImageUrl = "";
let itemUploadedImageUrl = "";

const STANDARD_CATEGORIES = ["Fast Food", "Desi", "Dessert", "Drinks", "Chinese"];

// --- TAB SWITCHER ---
window.switchTab = (tab) => {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (tab === 'shop') {
        document.getElementById('shop-tab').style.display = 'block';
        document.querySelector('.nav-item[onclick*="shop"]').classList.add('active');
        updateShopView();
    } else if (tab === 'items') {
        document.getElementById('items-tab').style.display = 'block';
        document.querySelector('.nav-item[onclick*="items"]').classList.add('active');
    } else if (tab === 'orders') {
        document.getElementById('orders-tab').style.display = 'block';
        document.querySelector('.nav-item[onclick*="orders"]').classList.add('active');
    }
}


function initSidebar() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const navItems = document.querySelectorAll('.nav-item');

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    function closeSidebar() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // Auto-close on mobile nav click
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });

    // Handle resize events to cleanup state
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeSidebar(); // Reset state on larger screens
        }
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initSidebar);


if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);


onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Update Profile Info in UI
        const mobileAvatar = document.getElementById('mobileAvatar');
        const headerAvatar = document.getElementById('headerAvatar');
        const mobileName = document.getElementById('mobileName');
        const headerName = document.getElementById('headerName');

        // Check role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const role = userData.role || 'user';

        if (role !== 'vendor') {
            showToast("Access denied. Vendor account required.", "error");
            setTimeout(() => window.location.href = '../index.html', 1500);
            return;
        }

        // Update vendor profile UI
        const avatar = userData.image || (user.photoURL || 'https://via.placeholder.com/50');
        const displayName = userData.displayName || user.displayName || user.email;

        if (mobileAvatar) mobileAvatar.querySelector('img').src = avatar;
        if (headerAvatar) headerAvatar.querySelector('img').src = avatar;
        if (mobileName) mobileName.textContent = displayName;
        if (headerName) headerName.textContent = displayName;

        // Check verification and initialize dashboard
        await checkVerification(user.uid);

        // Start real-time order listener
        listenToVendorOrders(user.uid);

    } else {
        window.location.href = '../login.html';
    }
});

// Expose logout for lockdown screen
window.logoutUser = logoutUser;

async function checkVerification(uid) {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
        const userData = userDoc.data();
        const verificationPendingScreen = document.getElementById('pending-verification-screen');
        const sidebarNav = document.querySelector('.sidebar-nav');

        // Update profile labels
        const displayName = userData.displayName || currentUser.email.split('@')[0];
        const photoURL = userData.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName) + '&background=FF6B6B&color=fff&size=128';

        document.getElementById('headerName').textContent = displayName;
        document.getElementById('mobileName').textContent = displayName;

        const headerImgEl = document.querySelector('#headerAvatar img');
        const mobileImgEl = document.querySelector('#mobileAvatar img');

        if (headerImgEl) headerImgEl.src = photoURL;
        if (mobileImgEl) mobileImgEl.src = photoURL;

        if (userData.isVerified) {
            dashboardContent.style.display = 'block';
            if (verificationPendingScreen) verificationPendingScreen.style.display = 'none';
            if (sidebarNav) {
                sidebarNav.style.pointerEvents = 'auto';
                sidebarNav.style.opacity = '1';
            }
            await loadShopDetails();
        } else {
            dashboardContent.style.display = 'block';
            if (verificationPendingScreen) verificationPendingScreen.style.display = 'block';

            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

            // LOCK SIDEBAR: Hide actual nav links and only keep "My Shop" (active but disabled)
            if (sidebarNav) {
                sidebarNav.style.pointerEvents = 'none';
                sidebarNav.style.opacity = '0.5';
            }

            if (window.lucide) lucide.createIcons();
        }
    }
}

// --- CLOUDINARY UPLOAD ---
async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
        });
        console.log(response);
        const data = await response.json();

        console.log("Cloudinary Response Data:", data);

        if (!response.ok) {
            console.error("Error Details:", data);
            throw new Error(data.error?.message || JSON.stringify(data.error) || "Upload failed with status " + response.status);
        }

        if (data.secure_url) {
            return data.secure_url;
        } else {
            throw new Error("No secure_url returned");
        }
    } catch (error) {
        console.error("Cloudinary Error Log:", error);
        throw error;
    }
}

// Image Input Handler
const uploadArea = document.querySelector('.image-upload-area');

async function handleFileUpload(file) {
    if (!file) return;

    // Show loading state
    showToast("Uploading image...", "info");

    try {
        if (CLOUDINARY_URL.includes("YOUR_CLOUD_NAME")) {
            alert("Please configure Cloudinary Keys in vendor.js to upload real images! for now we will use a placeholder.");
            uploadedImageUrl = URL.createObjectURL(file); // Local preview fallback
        } else {
            uploadedImageUrl = await uploadImage(file);
        }

        // Show Preview
        imagePreview.style.display = 'block';
        imagePreview.querySelector('img').src = uploadedImageUrl;
        uploadPlaceholder.style.display = 'none';

    } catch (error) {
        showToast(`Upload Failed: ${error.message}`, "error");
    }
}

shopImageInput.addEventListener('change', async (e) => {
    handleFileUpload(e.target.files[0]);
});

// Drag and Drop Logic
if (uploadArea) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        uploadArea.style.borderColor = 'var(--primary-color)';
        uploadArea.style.background = '#fff5f5';
    }

    function unhighlight(e) {
        uploadArea.style.borderColor = '#cbd5e0';
        uploadArea.style.background = '#f8fafc';
    }

    uploadArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFileUpload(files[0]);
    }

    // Make whole area clickable
    uploadArea.addEventListener('click', () => {
        shopImageInput.click();
    });
}

// --- ITEM IMAGE UPLOAD HANDLING ---
async function handleItemFileUpload(file) {
    if (!file) return;

    showToast("Uploading item image...", "info");

    try {
        if (CLOUDINARY_URL.includes("YOUR_CLOUD_NAME")) {
            itemUploadedImageUrl = URL.createObjectURL(file);
        } else {
            itemUploadedImageUrl = await uploadImage(file);
        }

        // Show Preview
        itemImagePreview.style.display = 'block';
        itemPreviewImg.src = itemUploadedImageUrl;
        itemUploadPlaceholder.style.display = 'none';

    } catch (error) {
        showToast(`Item Upload Failed: ${error.message}`, "error");
    }
}

itemImageInput?.addEventListener('change', (e) => {
    handleItemFileUpload(e.target.files[0]);
});

if (itemUploadArea) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        itemUploadArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        itemUploadArea.addEventListener(eventName, () => {
            itemUploadArea.style.borderColor = 'var(--primary-color)';
            itemUploadArea.style.background = '#fff5f5';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        itemUploadArea.addEventListener(eventName, () => {
            itemUploadArea.style.borderColor = '#cbd5e0';
            itemUploadArea.style.background = '#f8fafc';
        }, false);
    });

    itemUploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleItemFileUpload(dt.files[0]);
    }, false);

    itemUploadArea.addEventListener('click', () => {
        itemImageInput.click();
    });
}

itemRemoveImageBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    itemUploadedImageUrl = "";
    itemImageInput.value = "";
    itemImagePreview.style.display = 'none';
    itemUploadPlaceholder.style.display = 'flex';
});

removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering upload area click
    uploadedImageUrl = "";
    shopImageInput.value = "";
    imagePreview.style.display = 'none';
    uploadPlaceholder.style.display = 'flex';
});

// --- CATEGORY MANAGEMENT ---
categorySelect.addEventListener('change', (e) => {
    if (e.target.value === 'Other') {
        customCategoryInput.style.display = 'block';
        customCategoryInput.focus();
    } else {
        customCategoryInput.style.display = 'none';
    }
});

addCategoryBtn.addEventListener('click', () => {
    const selected = categorySelect.value;
    let val = selected;

    if (selected === 'Other') {
        val = customCategoryInput.value.trim();
    }

    if (val && !shopCategories.includes(val)) {
        shopCategories.push(val);
        renderCategories();
        // Reset
        categorySelect.value = "";
        customCategoryInput.value = "";
        customCategoryInput.style.display = 'none';
    }
});


function renderCategories() {
    categoryContainer.innerHTML = shopCategories.map(cat => `
        <span class="cat-chip" data-category="${cat.replace(/"/g, '&quot;')}">
            ${cat} 
            <i data-lucide="x-circle" style="width: 16px; height: 16px; cursor: pointer;"></i>
        </span>
    `).join('');
    finalCategoryList.value = shopCategories.join(',');

    // Add event listeners using delegation
    categoryContainer.querySelectorAll('.cat-chip i').forEach(icon => {
        icon.addEventListener('click', (e) => {
            const chip = e.target.closest('.cat-chip');
            const cat = chip.dataset.category;
            removeCategory(cat);
        });
    });

    // Also update Item Modal Select
    updateItemCategorySelect();
    if (window.lucide) lucide.createIcons();
}

function removeCategory(cat) {
    shopCategories = shopCategories.filter(c => c !== cat);
    renderCategories();
}

function updateItemCategorySelect() {
    const chipContainer = document.getElementById('itemCategoryChips');

    // Merge Shop Categories + Standard Categories (Unique)
    const allCats = new Set([...(currentShop.categoryList || []), ...STANDARD_CATEGORIES, "General"]);
    const sortedCats = Array.from(allCats).sort();

    let html = `
        <div style="width: 100%; margin-bottom: 5px;"><small style="color: var(--text-secondary); font-weight: 700;">SELECT CATEGORY:</small></div>
        ${sortedCats.map(c => `
            <div class="selectable-chip" onclick="selectItemCategory('${c}', this)">${c}</div>
        `).join('')}
    `;

    chipContainer.innerHTML = html;

    // Pre-select "General" or first category if none selected
    const selectedInput = document.getElementById('selectedItemCategory');
    if (!selectedInput.value) {
        // Try to find General, else first
        let defaultCat = sortedCats.includes("General") ? "General" : sortedCats[0];
        const chip = Array.from(chipContainer.querySelectorAll('.selectable-chip')).find(el => el.textContent === defaultCat);
        if (chip) selectItemCategory(defaultCat, chip);
    }
}


window.addAndSelectItemCategory = async (cat, el) => {
    // Add to shop profile via the same logic as custom add
    if (!shopCategories.includes(cat)) {
        shopCategories.push(cat);

        // Sync to Firestore
        if (currentShop) {
            try {
                await setDoc(doc(db, "shops", currentShop.id), {
                    categoryList: shopCategories
                }, { merge: true });
                showToast(`Added ${cat} to your shop profile!`, "success");
            } catch (error) {
                console.error("Sync Error:", error);
            }
        }

        // Update UI
        renderCategories();
        updateShopView();
        updateItemCategorySelect();

        // Find the new chip in "Shop Categories" and select it
        setTimeout(() => {
            const chips = document.querySelectorAll('#itemCategoryChips .selectable-chip');
            const newChip = Array.from(chips).find(c => c.textContent === cat && c.classList.contains('shop-cat'));
            if (newChip) selectItemCategory(cat, newChip);
        }, 50);
    }
}

window.selectItemCategory = (cat, el) => {
    document.querySelectorAll('.selectable-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('selectedItemCategory').value = cat;
}

// --- CATEGORY AUTO-SYNC FROM MODAL ---
const modalAddCatBtn = document.getElementById('modalAddCatBtn');
const modalCustomCategory = document.getElementById('modalCustomCategory');

modalAddCatBtn?.addEventListener('click', async () => {
    const newCat = modalCustomCategory.value.trim();
    if (!newCat) return;

    if (shopCategories.includes(newCat)) {
        showToast("Category already exists", "info");
        return;
    }

    // Add to local state
    shopCategories.push(newCat);
    modalCustomCategory.value = "";

    // Sync back to shop profile in Firestore
    if (currentShop) {
        try {
            await setDoc(doc(db, "shops", currentShop.id), {
                categoryList: shopCategories
            }, { merge: true });
            showToast("New category synced to profile!", "success");
        } catch (error) {
            console.error("Sync Error:", error);
        }
    }

    // Update all UI parts
    renderCategories();          // Updates Edit Form chips
    updateItemCategorySelect();  // Updates Modal selection chips
    updateShopView();            // Updates View Mode display

    // Auto-select the newly added category chip in the modal
    setTimeout(() => {
        const chips = document.querySelectorAll('#itemCategoryChips .selectable-chip');
        const newChip = Array.from(chips).find(c => c.textContent === newCat);
        if (newChip) selectItemCategory(newCat, newChip);
    }, 100);
});

// --- SHOP LOGIC ---
async function loadShopDetails() {
    const q = query(collection(db, "shops"), where("vendorId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        const shopDoc = querySnapshot.docs[0];
        currentShop = { id: shopDoc.id, ...shopDoc.data() };

        // Populate Form
        shopForm.elements['shopName'].value = currentShop.shopName;

        // Categories
        shopCategories = currentShop.categoryList || [];
        renderCategories();

        // Image
        if (currentShop.imageUrl) {
            uploadedImageUrl = currentShop.imageUrl;
            imagePreview.style.display = 'block';
            imagePreview.querySelector('img').src = uploadedImageUrl;
            uploadPlaceholder.style.display = 'none';
        }

        loadItems(currentShop.id);
        updateShopView(); // Update view mode with shop data
    }
}

shopForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveShopBtn');
    toggleLoading(btn, true, 'Saving...');

    // Get shop name directly from input
    const shopNameValue = document.getElementById('shopName').value.trim();

    if (!shopNameValue) {
        showToast("Please enter shop name", "error");
        toggleLoading(btn, false, 'Save Shop Details');
        return;
    }

    try {
        const shopData = {
            vendorId: currentUser.uid,
            shopName: shopNameValue,
            categoryList: shopCategories,
            imageUrl: uploadedImageUrl,
            isActive: true
        };

        if (currentShop) {
            await setDoc(doc(db, "shops", currentShop.id), shopData, { merge: true });
            currentShop = { ...currentShop, ...shopData };
            showToast("Shop updated!", "success");
        } else {
            const docRef = await addDoc(collection(db, "shops"), shopData);
            currentShop = { id: docRef.id, ...shopData };
            showToast("Shop created!", "success");
        }

        // ALSO save banner image as vendor's profile picture
        if (uploadedImageUrl) {
            await setDoc(doc(db, "users", currentUser.uid), {
                photoURL: uploadedImageUrl
            }, { merge: true });

            // Update UI immediately
            document.querySelector('#headerAvatar img').src = uploadedImageUrl;
            document.querySelector('#mobileAvatar img').src = uploadedImageUrl;
        }

        loadItems(currentShop.id);

        // Auto-switch back to View Mode after save
        shopEditMode.style.display = 'none';
        shopViewMode.style.display = 'block';
        updateShopView();

    } catch (error) {
        console.error("Shop Error:", error);
        showToast("Error saving shop", "error");
    }

    toggleLoading(btn, false, 'Save Shop Details');
});

// --- ITEMS LOGIC ---
// (Reusing similar logic but adapted for image URL input)
const itemForm = document.getElementById('itemForm');
itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentShop) { showToast("Create shop first!", "error"); return; }

    // Validate image
    if (!itemUploadedImageUrl) {
        showToast("Please upload an item image", "error");
        return;
    }

    const data = getFormData(itemForm);
    const btn = document.getElementById('addItemBtn');
    toggleLoading(btn, true, 'Adding...');


    // CHECK & UPDATE SHOP CATEGORIES AUTOMATICALLY
    // If the selected category is not in the shop's list, add it now.
    if (data.category && !shopCategories.includes(data.category)) {
        try {
            shopCategories.push(data.category);
            await setDoc(doc(db, "shops", currentShop.id), {
                categoryList: shopCategories
            }, { merge: true });

            // Update UI parts that depend on categories
            renderCategories();
            updateShopView();
            console.log(`Auto-added new category '${data.category}' to shop profile.`);
        } catch (catError) {
            console.error("Error auto-updating shop categories:", catError);
            // We don't stop the item addition if this fails, but it's good to know.
        }
    }

    try {
        await addDoc(collection(db, "items"), {
            shopId: currentShop.id,
            name: data.name,
            price: Number(data.price),
            category: data.category,
            imageUrl: itemUploadedImageUrl, // Use the uploaded URL
            vendorId: currentUser.uid
        });

        showToast("Item added!", "success");

        // Reset Item Modal State
        itemForm.reset();
        itemUploadedImageUrl = "";
        itemImageInput.value = "";
        itemImagePreview.style.display = 'none';
        itemUploadPlaceholder.style.display = 'flex';

        document.getElementById('itemModal').style.display = 'none';
        loadItems(currentShop.id);

        // Reset category selection logic to reflect changes if any
        updateItemCategorySelect();

    } catch (error) {
        console.error("Item Error:", error);
        showToast("Error adding item", "error");
    }
});

async function loadItems(shopId) {
    const list = document.getElementById('items-list');
    list.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">Loading menu...</div>';

    try {
        const q = query(collection(db, "items"), where("shopId", "==", shopId));
        const querySnapshot = await getDocs(q);

        list.innerHTML = '';
        if (querySnapshot.empty) {
            list.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-secondary); grid-column: 1/-1;">' +
                '<i data-lucide="utensils-crossed" style="width: 48px; height: 48px; margin-bottom: 10px; opacity: 0.5;"></i>' +
                '<p>Your menu is empty. Add your first item!</p></div>';
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Group items by category
        const groupedItems = {};
        querySnapshot.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            const cat = item.category || "General";
            if (!groupedItems[cat]) groupedItems[cat] = [];
            groupedItems[cat].push(item);
        });

        // Loop through categories and render headers + grids
        Object.keys(groupedItems).sort().forEach(category => {
            const catSection = document.createElement('div');
            catSection.className = 'category-section';
            catSection.style.gridColumn = "1 / -1"; // Make header span full width

            catSection.innerHTML = `
                <div class="category-header">
                    <i data-lucide="utensils"></i>
                    ${category}
                    <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-left: 5px;">(${groupedItems[category].length})</span>
                </div>
                <div class="items-grid">


                        ${groupedItems[category].map(item => `
                            <div class="item-card">
                                <div class="item-image-wrapper">
                                    <img src="${item.imageUrl}" alt="${item.name}" class="item-image" onerror="this.src='https://via.placeholder.com/150'">
                                    <div class="item-badge">${category}</div>
                                </div>
                                <div class="item-content">
                                    <h4 class="item-title">${item.name}</h4>
                                    <div class="item-meta">
                                        <span class="item-price">${item.price}</span>
                                        <button onclick="deleteItem('${item.id}')" class="action-btn-icon delete-btn" title="Delete Item">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                </div>
            `;
            list.appendChild(catSection);
        });

        if (window.lucide) lucide.createIcons();

    } catch (error) {
        console.error("Load Items Error:", error);
        list.innerHTML = '<p style="color:red; padding: 20px;">Error loading items.</p>';
    }
}

window.deleteItem = async (id) => {
    if (!confirm("Delete item?")) return;
    await deleteDoc(doc(db, "items", id));
    loadItems(currentShop.id);
}
