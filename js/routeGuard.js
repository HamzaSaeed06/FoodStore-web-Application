import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function initRouteGuard(allowedRoles = []) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Not logged in -> Redirect to login
            // Use window.location.pathname to check if we are already on login/signup or public home
            const path = window.location.pathname;
            if (!path.includes('login.html') && !path.includes('signup.html') && !path.endsWith('index.html') && path !== '/' && !path.endsWith('foodstore/')) {
                window.location.href = "../login.html";
            }
        } else {
            // Logged in -> Check Role
            if (allowedRoles.length > 0) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    if (!allowedRoles.includes(role)) {
                        // Role mismatch
                        document.body.innerHTML = "<h1>403 Forbidden: Access Denied</h1><p>You do not have permission to view this page.</p><a href='../index.html'>Go Home</a>";
                    }
                } else {
                    // No user doc
                    alert("Auth error: User profile not found.");
                }
            }
        }
    });
}
