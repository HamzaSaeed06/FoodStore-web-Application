import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, toggleLoading } from './utils.js';
import { logoutUser } from './auth.js';

// --- CLOUDINARY CONFIG (Same as vendor/vendor.js) ---
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/ds05q0lls/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "mypreset";

// --- CLOUDINARY UPLOAD HELPER ---
async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Cloudinary upload failed");
        }

        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary Error:", error);
        throw error;
    }
}

// DOM Elements
const profileForm = document.getElementById('profile-form');
const nameInput = document.getElementById('profile-name');
const phoneInput = document.getElementById('profile-phone');
const addressInput = document.getElementById('profile-address');
const emailDisplay = document.getElementById('user-email-display');
const profilePic = document.getElementById('profile-pic');
const picUpload = document.getElementById('pic-upload');
const saveBtn = document.getElementById('save-profile-btn');
const logoutBtn = document.getElementById('logout-btn');
const authLinks = document.getElementById('auth-links');

let currentUser = null;
let selectedFile = null; // Store for delayed upload

// Init Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        setupAuthLinks(user);
        updateBottomNav(user);
        await loadUserProfile(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

async function setupAuthLinks(user) {
    if (!authLinks) return;

    authLinks.innerHTML = `
        <a href="index.html" class="nav-menu-link">Home</a>
        <a href="orders.html" class="nav-menu-link">Track Order</a>
        <a href="cart.html" class="nav-menu-link">Cart</a>
        <a href="profile.html" class="nav-menu-link active">Account</a>
    `;
    if (window.lucide) lucide.createIcons();
}

function updateBottomNav(user) {
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
        <a href="orders.html" class="bottom-nav-item">
            <i data-lucide="package"></i>
            <span>Track Order</span>
        </a>
        <a href="profile.html" class="bottom-nav-item active">
            <i data-lucide="user"></i>
            <span>Account</span>
        </a>
    `;
    if (window.lucide) lucide.createIcons();
}

async function loadUserProfile(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            nameInput.value = data.displayName || '';
            phoneInput.value = data.phoneNumber || '';
            addressInput.value = data.defaultAddress || '';
            emailDisplay.textContent = data.email;

            if (data.photoURL) {
                profilePic.innerHTML = `<img src="${data.photoURL}" alt="Profile">`;
            }
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        showToast("Error loading profile data", "error");
    }
}

// Handle Profile Pic Upload (Delayed Preview Only)
picUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast("Image size must be less than 2MB", "error");
        return;
    }

    selectedFile = file;
    // Local preview logic
    const reader = new FileReader();
    reader.onload = (event) => {
        profilePic.innerHTML = `<img src="${event.target.result}" alt="Profile Preview">`;
    };
    reader.readAsDataURL(file);
});

// Handle Profile Update + Upload
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    toggleLoading(saveBtn, true, 'Saving changes...');

    try {
        let photoURL = null;

        // ONLY Upload if new file selected
        if (selectedFile) {
            showToast("Finalizing profile picture...", "info");
            photoURL = await uploadImageToCloudinary(selectedFile);
        }

        const updateData = {
            displayName: nameInput.value,
            phoneNumber: phoneInput.value,
            defaultAddress: addressInput.value,
            updatedAt: new Date()
        };

        if (photoURL) {
            updateData.photoURL = photoURL;
        }

        await updateDoc(doc(db, "users", currentUser.uid), updateData);

        selectedFile = null; // Reset state
        showToast("Profile updated successfully!", "success");

        // Refresh nav links
        setupAuthLinks(currentUser);

    } catch (error) {
        console.error("Save failed:", error);
        showToast("Error saving profile: " + error.message, "error");
    } finally {
        toggleLoading(saveBtn, false, 'Save Changes');
    }
});

logoutBtn.addEventListener('click', logoutUser);
