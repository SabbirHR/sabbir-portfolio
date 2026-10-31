/**
 * main.js — Core site behaviour: footer year, contact form (FormSubmit.co AJAX),
 * mobile navigation, and scroll-based nav highlighting.
 * Progressive enhancement: the form's native POST action still works if JS fails.
 */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* --------------------------------------------------------------------------
 * Mobile navigation (hamburger)
 * -------------------------------------------------------------------------- */
(function initMobileNav() {
    const toggle = document.getElementById('nav-toggle');
    const panel = document.getElementById('mobile-nav');
    const icon = document.getElementById('nav-toggle-icon');
    if (!toggle || !panel) return;

    const setOpen = (open) => {
        panel.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (icon) icon.className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    };

    toggle.addEventListener('click', () => {
        setOpen(!panel.classList.contains('is-open'));
    });

    // Close when a nav link is clicked
    panel.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) {
            setOpen(false);
            toggle.focus();
        }
    });

    // Close if the viewport grows to desktop width
    const mq = window.matchMedia('(min-width: 768px)');
    mq.addEventListener('change', (e) => {
        if (e.matches) setOpen(false);
    });
})();

/* --------------------------------------------------------------------------
 * Active-link highlighting + current-section indicator
 * -------------------------------------------------------------------------- */
(function initNavHighlight() {
    const sections = Array.from(document.querySelectorAll('section[id]'));
    const navLinks = Array.from(document.querySelectorAll('.nav-link'));
    const indicator = document.querySelector('.nav-current');
    if (!sections.length || !navLinks.length) return;

    const linkById = new Map();
    navLinks.forEach((link) => {
        const id = link.getAttribute('href').slice(1);
        if (!linkById.has(id)) linkById.set(id, []);
        linkById.get(id).push(link);
    });

    const setActive = (id) => {
        navLinks.forEach((l) => l.classList.remove('active'));
        const links = linkById.get(id);
        if (links) links.forEach((l) => l.classList.add('active'));
        if (indicator) {
            const active = links && links[0];
            indicator.textContent = active ? active.textContent.trim() : '';
        }
    };

    const observer = new IntersectionObserver(
        (entries) => {
            // Pick the most visible intersecting section
            const visible = entries
                .filter((e) => e.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
            if (visible.length) setActive(visible[0].target.id);
        },
        { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] }
    );

    sections.forEach((s) => observer.observe(s));
})();

/* --------------------------------------------------------------------------
 * Project card 3D tilt — pointer:fine only (no tilt on touch, no click theft)
 * -------------------------------------------------------------------------- */
(function initTilt() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (prefersReducedMotion()) return;

    const cards = document.querySelectorAll('.project-card');
    const MAX_DEG = 6;

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    cards.forEach((card) => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width - 0.5;  // -0.5..0.5
            const py = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.transform =
                `rotateY(${(px * MAX_DEG).toFixed(2)}deg) rotateX(${(-py * MAX_DEG).toFixed(2)}deg) translateZ(0)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
        });
    });
})();

/* --------------------------------------------------------------------------
 * Contact form (FormSubmit.co AJAX) — guarded so a missing form node (or a
 * partial DOM) can never throw and break the rest of main.js.
 * -------------------------------------------------------------------------- */
(function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const status = document.getElementById('form-status');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!status || !submitBtn) return;

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
})();
