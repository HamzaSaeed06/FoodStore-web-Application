/**
 * Utility Functions for Food Store App
 */

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

    // Use standard Center Alert with Confirm Button and Long Timer
    // Returns the promise so callers can await it
    return Swal.fire({
        icon: type,
        title: message,
        text: text, // Subtitle text
        showConfirmButton: true, // Show OK button
        confirmButtonText: 'OK',
        confirmButtonColor: '#ff6b6b', // Match App Primary Color
        timer: 4000, // 4 seconds
        timerProgressBar: true,
        position: 'center'
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
