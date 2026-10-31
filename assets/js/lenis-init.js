/**
 * lenis-init.js — optional smooth scrolling (Lenis, window mode only).
 *
 * Deliberately defensive: Lenis runs through the GSAP ticker, so a broken
 * Lenis would break sitewide scrolling and every GSAP animation. Everything
 * is wrapped in try/catch, the raf callback self-disables on error, and if
 * the CDN never delivered window.Lenis this file does nothing at all — the
 * site then keeps native scrolling (scroll-behavior:smooth stays in CSS).
 *
 * Contracts:
 *   - window (default) mode ONLY — wrapper mode would break position:sticky
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
    if (!Lenis || !window.gsap || !window.ScrollTrigger) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    const root = document.documentElement;

    let lenis = null;

    function teardown() {
        if (lenis) {
            gsap.ticker.remove(raf);
            try {
                if (typeof lenis.destroy === 'function') lenis.destroy();
            } catch (err) {
                console.warn('Lenis destroy failed (ignored).', err);
            }
            lenis = null;
        }
        root.classList.remove('lenis-active');
    }

    function raf(time) {
        try {
            lenis.raf(time * 1000);
        } catch (err) {
            console.warn('Lenis raf failed; falling back to native scrolling.', err);
            teardown();
        }
    }

    try {
        lenis = new Lenis(); // default window mode

        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);

        root.classList.add('lenis-active');
    } catch (err) {
        console.warn('Lenis init failed; keeping native scrolling.', err);
        teardown();
    }
})();
