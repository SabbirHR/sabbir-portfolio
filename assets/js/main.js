/**
 * main.js — Core site behaviour: footer year, contact form (FormSubmit.co AJAX).
 * Progressive enhancement: the form's native POST action still works if JS fails.
 */
document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');

form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Loading state
    submitBtn.disabled = true;
    if (btnText) btnText.innerHTML = '<i class="fa-solid fa-circle-notch spin spinner-icon"></i> SENDING...';
    status.className = 'form-status is-loading';
    status.hidden = false;
    status.innerHTML = '<span class="pulse">TRANSMITTING TO NEURAL LINK...</span>';

    const formData = new FormData(form);

    fetch(form.action, {
        method: "POST",
        body: formData,
        headers: {
            'Accept': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.success === "true" || data.success === true) {
                // FormSubmit may require email verification the first time!
                status.innerHTML = '&#10003; EMAIL DELIVERED. (Note: Check inbox/spam to verify activation if first time!)';
                status.className = 'form-status is-success';
                form.reset();
                if (btnText) btnText.innerHTML = '&#10003; TRANSFER COMPLETE';
                submitBtn.classList.add('is-success');
                setTimeout(function () {
                    submitBtn.disabled = false;
                    if (btnText) btnText.innerHTML = 'Execute Transfer';
                    submitBtn.classList.remove('is-success');
                    status.className = 'form-status';
                    status.hidden = true;
                }, 8000);
            } else {
                throw new Error(data.message || "Transmission failed");
            }
        })
        .catch(error => {
            console.error('FormSubmit Error:', error);
            status.innerHTML = 'ERROR: ' + error.message;
            status.className = 'form-status is-error';
            status.hidden = false;
            submitBtn.disabled = false;
            if (btnText) btnText.innerHTML = 'RETRY TRANSFER';
        });
});
