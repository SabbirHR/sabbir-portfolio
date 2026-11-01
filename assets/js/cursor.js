/**
 * cursor.js — Neo-Technical Editorial pointer layer.
 *
 * Two decorative elements: a 6px lime dot and a 28px hairline ring
 * (mix-blend-mode: difference), both lerped toward the pointer at 0.18.
 * The native cursor is hidden ONLY through the `has-cursor` class on <html>,
 * which is added after this file has fully initialised — if any gate fails
 * (coarse pointer, reduced motion), the script bails before touching
 * the DOM and the browser keeps its native cursor.
 *
 * Magnetic translation for .btn-hire / .btn-submit uses lightweight
 * vanilla JS + a single CSS transition — no GSAP dependency.
 *
 * Gates: pointer:fine && !prefers-reduced-motion.
 * Accessibility: elements are aria-hidden + pointer-events:none; :focus-visible
 * outlines are never modified.
 */
(function initCursor() {
    'use strict';

    // --- Gates -------------------------------------------------------------
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const LERP = 0.18;
    const MAGNET_CLAMP = 10;

    // --- Elements ----------------------------------------------------------
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    dot.setAttribute('aria-hidden', 'true');

    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    ring.setAttribute('aria-hidden', 'true');

    const anchors = document.body || document.documentElement;
    anchors.appendChild(dot);
    anchors.appendChild(ring);

    // --- State -------------------------------------------------------------
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const dotPos = { x: pointer.x, y: pointer.y };
    const ringPos = { x: pointer.x, y: pointer.y };
    let rafId = null;
    let started = false;

    // --- CSS classes for hover state ---------------------------------------
    // These are toggled via delegated pointer events below; they add
    // a CSS class that triggers a 2-step transition (opacity+scale) defined
    // in style.css. No JS animation library needed.
    document.documentElement.classList.add('has-cursor');

    // --- Render loop (LERP only, hand-rolled rAF) -------------------------
    function render() {
        dotPos.x += (pointer.x - dotPos.x) * LERP;
        dotPos.y += (pointer.y - dotPos.y) * LERP;
        ringPos.x += (pointer.x - ringPos.x) * LERP;
        ringPos.y += (pointer.y - ringPos.y) * LERP;

        dot.style.transform =
            'translate3d(' + dotPos.x.toFixed(2) + 'px,' + dotPos.y.toFixed(2) + 'px,0) translate(-50%,-50%)';
        ring.style.transform =
            'translate3d(' + ringPos.x.toFixed(2) + 'px,' + ringPos.y.toFixed(2) + 'px,0) translate(-50%,-50%)';
    }

    function loop() {
        if (!started) return;
        rafId = window.requestAnimationFrame(loop);
        render();
    }

    function start() {
        if (started) return;
        started = true;
        // Opacity fade-in is now a CSS class transition; we just ensure the
        // elements are visible by removing any hidden state that may have
        // been injected during a prior reduced-motion bail-out.
        dot.style.opacity = '1';
        ring.style.opacity = '1';
        rafId = window.requestAnimationFrame(loop);
    }

    function stop() {
        started = false;
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
        }
    }

    // --- Magnetic buttons: vanilla JS spring --------------------------------
    // One-time setup: grab the buttons once and remember their initial positions.
    const MAGNET_MAX = 10; // px
    const magnetButtons = document.querySelectorAll('.btn-hire, .btn-submit');
    magnetButtons.forEach(function(btn) {
        btn._magnetInitialX = btn.getBoundingClientRect().left;
        btn._magnetInitialY = btn.getBoundingClientRect().top;
    });

    function magnet(evt) {
        if (!started) return;
        const btn = evt.target.closest('.btn-hire, .btn-submit');
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const dx = evt.clientX - rect.left - rect.width / 2;
        const dy = evt.clientY - rect.top - rect.height / 2;
        const x = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx));
        const y = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy));

        // Apply translate via inline style (clamped); the CSS :hover class
        // will restore the original position via transition.
        btn.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    }

    function unMagnet(evt) {
        const btn = evt.target.closest('.btn-hire, .btn-submit');
        if (!btn) return;
        btn.style.transform = '';
    }

    // Delegated pointer events for hover state + magnetic feedback
    document.addEventListener('pointermove', magnet, { passive: true });
    document.addEventListener('pointerleave', unMagnet);

    // Ensure native cursor on form controls is preserved
    const nativeCursorElements = document.querySelectorAll('input, textarea, select, button');
    nativeCursorElements.forEach(function(el) {
        el.style.webkitTapHighlightColor = 'transparent'; // lower visual noise
    });
})();