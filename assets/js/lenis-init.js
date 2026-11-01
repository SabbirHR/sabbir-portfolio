/**
 * lenis-init.js — optional smooth scrolling (Lenis, window mode only).
 *
 * Deliberately defensive: Lenis runs its own rAF loop; there is NO dependency
 * on GSAP or ScrollTrigger. If any sticky/anchor/scroll regression is observed,
 * delete the two <script> tags in index.html and this file — nothing else
 * depends on Lenis.
 *
 * Contracts:
 *   - window mode ONLY — wrapper mode would break position:sticky
 *   - native touch scrolling is untouched (no syncTouch option passed)
 *   - scroll-padding-top keeps working (it is a separate CSS property)
 *   - html.lenis-active deletes scroll-behavior:smooth (see style.css)
 * DROP CONDITION: if any sticky/anchor/scroll regression is observed, delete
 * the two <script> tags in index.html and this file — nothing else depends on
 * Lenis.
 */
(function initLenis() {
    'use strict';

    const Lenis = window.Lenis;
    if (!Lenis) return;

    // Reduced-motion gate
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;

    function teardown() {
        if (window.lenis) {
            try {
                if (typeof lenis.destroy === 'function') lenis.destroy();
            } catch (err) {
                console.warn('Lenis destroy failed (ignored).', err);
            }
            window.lenis = null;
        }
        root.classList.remove('lenis-active');
    }

    const lenis = new Lenis(); // default window mode

    // Lenis's own rAF loop — does NOT touch gsap.ticker or ScrollTrigger
    function raf(time) {
        try {
            lenis.raf(time * 1000);
        } catch (err) {
            console.warn('Lenis raf failed; falling back to native scrolling.', err);
            teardown();
        }
    }

    // Kick off the rAF loop
    window.lenis = lenis;
    lenis.on('scroll', () => { /* no-op — native scroll events fire on their own */ });
    // We use the rAF loop only; no gsap.ticker coupling.
    window.requestAnimationFrame(raf);

    root.classList.add('lenis-active');
})();