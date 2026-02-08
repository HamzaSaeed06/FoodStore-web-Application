import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast } from './utils.js';

const googleProvider = new GoogleAuthProvider();

// Signup Function
export async function signupUser(email, password, role) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        let isVerified = (role === 'user');

        // Create user document inside "users" collection
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            role: role,
            isVerified: isVerified,
            isOnline: true,
            createdAt: new Date()
        });

        await showToast("Account Created", "success", "You have successfully signed up!");
        resolveRedirect(role);

    } catch (error) {
        console.error("Signup Error:", error);
        showToast(error.message, "error");
    }
}

// Login Function
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch User Role
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists()) {
            // Set User Online
            await setDoc(doc(db, "users", user.uid), { isOnline: true }, { merge: true });

            const userData = userDoc.data();
            await showToast("Login Successful", "success", "Welcome back to FoodStore!");
            resolveRedirect(userData.role);
        } else {
            showToast("User record found in Auth but missing in Firestore.", "error");
        }

    } catch (error) {
        console.error("Login Error:", error);
        showToast(error.message, "error");
    }
}

// Logout Function
export async function logoutUser() {
    try {
        const user = auth.currentUser;
        if (user) {
            await setDoc(doc(db, "users", user.uid), { isOnline: false }, { merge: true });
        }
        await signOut(auth);
        window.location.href = "../login.html";
    } catch (error) {
        console.error("Logout Error:", error);
        showToast("Error logging out", "error");
    }
}

// Google Login Function
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if user exists in Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        let role = 'user';

        if (!userDoc.exists()) {
            // New Google User -> Default to 'user' role
            await setDoc(userDocRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL || '',
                role: role,
                isVerified: true, // Users are verified by default
                isOnline: true,
                createdAt: new Date(),
                authProvider: 'google'
            });
            await showToast("Account Created!", "success", "Signed in with Google successfully.");
        } else {
            await setDoc(userDocRef, { isOnline: true }, { merge: true });

            role = userDoc.data().role;
            await showToast("Welcome Back!", "success", "Signed in with Google successfully.");
        }

        resolveRedirect(role);

    } catch (error) {
        console.error("Google Auth Error:", error);
        showToast(error.message, "error");
    }
}

// Redirect Helper
function resolveRedirect(role) {
    // These paths are relative to login.html / signup.html (which are in the root /foodstore folder)
    if (role === 'admin') window.location.href = "admin/dashboard.html";
    else if (role === 'vendor') window.location.href = "vendor/dashboard.html";
    else window.location.href = "orders.html";
}
