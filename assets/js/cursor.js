/**
 * cursor.js — Neo-Technical Editorial pointer layer (vanilla, no engine).
 *
 * Two decorative elements: a 6px lime dot and a 28px hairline ring
 * (mix-blend-mode: difference). Both follow the pointer with DIFFERENTIAL
 * lag (dot 0.18 / ring 0.10) — the visible depth split — and the ring
 * expands over interactive elements while the dot shrinks.
 *
 * The native cursor is hidden ONLY through the `has-cursor` class on <html>,
 * added at the very end of a fully successful init — if any gate fails
 * (coarse pointer, reduced motion), the script bails before touching the DOM
 * and the browser keeps its native cursor.
 *
 * Magnetic translation for .btn-hire / .btn-submit: per-button mousemove
 * writes a clamped inline translate; the return motion comes from a CSS
 * transition (springy cubic-bezier) declared in style.css.
 *
 * Gates: pointer:fine && !prefers-reduced-motion.
 * Accessibility: elements are aria-hidden + pointer-events:none; :focus-visible
 * outlines are never modified; inputs/textarea keep their native text cursor
 * via the CSS contract in style.css (16. Custom cursor).
 */
(function initCursor() {
    'use strict';

    // --- Gates -------------------------------------------------------------
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!("requestAnimationFrame" in window)) return;

    const LERP_DOT = 0.18;
    const LERP_RING = 0.10;      // differential lag — ring trails the dot
    const LERP_SCALE = 0.15;     // hover-scale easing
    const RING_HOVER = 1.7;      // ring scale over interactive elements
    const MAGNET_X = 0.22;
    const MAGNET_Y = 0.3;
    const MAGNET_CLAMP = 10;

    // --- Elements (created only after the gates pass) ----------------------
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
    let ringScale = 1;
    let dotScale = 1;
    let hoverScaleTarget = 1;
    let rafId = null;
    let started = false;

    function render() {
        dotPos.x += (pointer.x - dotPos.x) * LERP_DOT;
        dotPos.y += (pointer.y - dotPos.y) * LERP_DOT;
        ringPos.x += (pointer.x - ringPos.x) * LERP_RING;
        ringPos.y += (pointer.y - ringPos.y) * LERP_RING;

        ringScale += (hoverScaleTarget - ringScale) * LERP_SCALE;
        const dotScaleTarget = hoverScaleTarget > 1 ? 0 : 1; // dot disappears while hovering
        dotScale += (dotScaleTarget - dotScale) * LERP_SCALE;

        dot.style.transform =
            'translate3d(' + dotPos.x.toFixed(2) + 'px,' + dotPos.y.toFixed(2) + 'px,0) translate(-50%,-50%)' +
            (dotScale !== 1 ? ' scale(' + dotScale.toFixed(3) + ')' : '');
        ring.style.transform =
            'translate3d(' + ringPos.x.toFixed(2) + 'px,' + ringPos.y.toFixed(2) + 'px,0) translate(-50%,-50%)' +
            (ringScale !== 1 ? ' scale(' + ringScale.toFixed(3) + ')' : '');
    }

    function loop() {
        if (!started) { rafId = null; return; }
        render();
        rafId = window.requestAnimationFrame(loop);
    }

    function start() {
        if (started) return;
        started = true;
        dot.style.opacity = '1';   // CSS transition handles the fade
        ring.style.opacity = '1';
        if (rafId === null) rafId = window.requestAnimationFrame(loop);
    }

    function stop() {
        if (!started) return;
        started = false;
        dot.style.opacity = '0';
        ring.style.opacity = '0';
        if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
    }

    // --- Pointer listeners --------------------------------------------------
    function onPointerMove(e) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        if (!started) start();
    }

    // Hover intent, delegated: the ring expands / dot shrinks over anything
    // interactive. mouseover/mouseout bubble from the real target, so the
    // closest() check is done against the tree per event — no per-element
    // listeners to leak.
    const HOVERABLE = 'a, button, input, textarea, select, [role="button"]';
    function onMouseOver(e) {
        if (e.target.closest && e.target.closest(HOVERABLE)) hoverScaleTarget = RING_HOVER;
    }
    function onMouseOut(e) {
        if (e.target.closest && e.target.closest(HOVERABLE)) hoverScaleTarget = 1;
    }

    // --- Magnetic buttons ----------------------------------------------------
    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    let magnetButtons = [];
    try {
        magnetButtons = Array.from(document.querySelectorAll('.btn-hire, .btn-submit'));
    } catch (err) { magnetButtons = []; }

    magnetButtons.forEach((btn) => {
        function onMove(e) {
            const rect = btn.getBoundingClientRect();
            const dx = clamp((e.clientX - (rect.left + rect.width / 2)) * MAGNET_X, -MAGNET_CLAMP, MAGNET_CLAMP);
            const dy = clamp((e.clientY - (rect.top + rect.height / 2)) * MAGNET_Y, -MAGNET_CLAMP, MAGNET_CLAMP);
            // CSS transition on transform (style.css) smooths both directions
            btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
        }
        function onLeave() {
            btn.style.transform = ''; // releases via the springy CSS transition
        }
        btn.addEventListener('mousemove', onMove, { passive: true });
        btn.addEventListener('mouseleave', onLeave);
    });

    // --- Wire listeners (script is page-lifetime; no teardown needed) --------
    document.addEventListener('mousemove', onPointerMove, { passive: true });
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });
    document.documentElement.addEventListener('mouseleave', stop);

    // --- Activate: only now is it safe to hide the native cursor -------------
    document.documentElement.classList.add('has-cursor');
    start();
})();
