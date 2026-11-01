/**
 * lenis-init.js — optional smooth scrolling (Lenis, window mode only).
 *
 * Deliberately defensive: Lenis drives its OWN rAF loop here — there is NO
 * dependency on any other animation engine. Everything is wrapped in try/catch:
 * a broken Lenis degrades to native scrolling (Lenis.destroy() removes its
 * managed classes, restoring CSS scroll-behavior). If window.Lenis never
 * arrived (vendored script failed) this file does nothing at all.
 *
 * Contracts:
 *   - window (default) mode ONLY — wrapper mode would break position:sticky
 *   - native touch scrolling is untouched (no syncTouch option passed)
 *   - scroll-padding-top keeps working (it is a separate CSS property)
 *   - html.lenis (Lenis's OWN managed class) deletes scroll-behavior:smooth
 *     (see style.css). A homemade marker class does NOT work here: Lenis
 *     rewrites <html> className wholesale on scroll state changes and wipes
 *     foreign classes — verified via cleanUpClassName in lenis 1.1.18.
 *   - the loop SELF-SCHEDULES: one requestAnimationFrame at init, then raf()
 *     asks for the next frame itself; time passed to lenis is the native
 *     rAF timestamp in MILLISECONDS (Lenis expects ms — not gsap seconds)
 * DROP CONDITION: if any sticky/anchor/scroll regression is observed, delete
 * the two <script> tags in index.html (lenis.min.js + this file) — nothing
 * else depends on Lenis.
 */
(function initLenis() {
    'use strict';

    const Lenis = window.Lenis;
    if (!Lenis) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    let lenis = null;
    let rafId = null;
    let stopped = false;

    function teardown() {
        stopped = true;
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (lenis) {
            try {
                if (typeof lenis.destroy === 'function') lenis.destroy();
            } catch (err) {
                console.warn('Lenis destroy failed (ignored).', err);
            }
            lenis = null;
        }
        // Lenis.destroy() removes its own managed classes (lenis*) — this is
        // a best-effort belt-and-braces if destroy was unavailable.
        try { root.classList.remove('lenis'); } catch (err) { /* non-fatal */ }
    }

    /** One frame of Lenis. Schedules its own next frame; on error it tears
     *  down once and lets native scrolling take over — never loops errors. */
    function raf(time) {
        if (stopped) return;
        try {
            lenis.raf(time);
        } catch (err) {
            console.warn('Lenis raf failed; falling back to native scrolling.', err);
            teardown();
            return;
        }
        rafId = window.requestAnimationFrame(raf);
    }

    try {
        lenis = new Lenis(); // default window mode; adds its own `lenis` class to <html>
        rafId = window.requestAnimationFrame(raf);
    } catch (err) {
        console.warn('Lenis init failed; keeping native scrolling.', err);
        teardown();
    }
})();
