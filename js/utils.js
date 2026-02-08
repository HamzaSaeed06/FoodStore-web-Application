// Inject SweetAlert2 dynamically

const swalScript = document.createElement('script');
swalScript.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11";
document.head.appendChild(swalScript);

// Show a SweetAlert notification
export function showToast(message, type = 'info', text = '') {
    // Wait for Swal to load if not ready
    if (typeof Swal === 'undefined') {
        setTimeout(() => showToast(message, type, text), 100);
        return;
    }

    return Swal.fire({
        icon: type,
        title: message,
        text: text,
        showConfirmButton: true,
        confirmButtonText: 'Got it',
        confirmButtonColor: '#ff6b6b',
        timer: (type === 'warning' || type === 'error') ? undefined : 2500,
        timerProgressBar: true,
        position: 'center',
        toast: false,
        showClass: {
            popup: 'animate__animated animate__fadeInDown animate__faster'
        },
        hideClass: {
            popup: 'animate__animated animate__fadeOutUp animate__faster'
        }
    });
}

// Format number as currency
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Get form data as object
export function getFormData(formElement) {
    const formData = new FormData(formElement);
    return Object.fromEntries(formData.entries());
}

// Loading Spinner Helper
export function toggleLoading(buttonBtn, isLoading, originalText = 'Submit') {
    if (isLoading) {
        buttonBtn.disabled = true;
        buttonBtn.innerHTML = '<span class="loader"></span> Loading...';
    } else {
        buttonBtn.disabled = false;
        buttonBtn.innerHTML = originalText;
    }
}

// Account Completeness Check
export async function checkAccountCompleteness(user, db) {
    if (!user) return;

    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists()) {
            const data = userDoc.data();
            const isMissingInfo = !data.phoneNumber || !data.defaultAddress;

            if (isMissingInfo && !sessionStorage.getItem('profilePromptShown')) {
                const result = await Swal.fire({
                    title: 'Complete Your Profile',
                    text: 'Please add your phone number and address to place orders easily.',
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'Go to Profile',
                    cancelButtonText: 'Later',
                    confirmButtonColor: '#ff6b6b'
                });

                sessionStorage.setItem('profilePromptShown', 'true');
                if (result.isConfirmed) {
                    window.location.href = 'profile.html';
                }
            }
        }
    } catch (error) {
        console.error("Account completeness check failed:", error);
    }
}
