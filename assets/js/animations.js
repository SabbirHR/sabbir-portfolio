/**
 * animations.js — motion v13 reveals, masked line reveals, hero stagger,
 * animated counters, timeline draw, and scroll progress bar.
 *
 * CRITICAL progressive-enhancement rule: every "hidden" initial state is set
 * with SYNCHRONOUS vanilla-JS style writes here (el.style.opacity = '0'),
 * never as static CSS. This module is a deferred <script type="module">:
 * if the vendored motion bundle fails to load or this file throws early, the
 * module never runs and all content renders in its final, fully visible state
 * (SEO-safe). Under prefers-reduced-motion we bail before touching anything.
 *
 * Masked line reveals split TEXT NODES ONLY (never innerHTML), so element
 * children such as the <span> around "Logic" and any <br> are preserved.
 * The split runs after document.fonts.ready, with a 2500ms timeout failsafe
 * (showPlain) so titles can never stay hidden.
 *
 * motion v13 vanilla API used (verified against the vendored bundle):
 *   inView(target, onEnter, { amount })  — fires ONCE by default unless the
 *       callback returns false; returns a stop function (not a promise).
 *       onEnter receives (target, entry).
 *   animate(elements | 0, keyframes, options) — element form returns a
 *       GroupAnimation whose `.finished` is a promise; single-value form
 *       `animate(0, 50, { onUpdate, onComplete })` passes options through.
 *   scroll(callback, { target, offset }) — JS-path scroll driver; callback
 *       receives (progress 0..1, info). Works under Lenis window-mode
 *       (it performs real window scrolling and fires native scroll events).
 *
 * Sticky-safety: a transform on `.project-card`/`.projects-grid` (or any
 * transformed ANCESTOR of a sticky element) breaks position:sticky, so
 * reveals animate CHILDREN only (.project-index, .project-main) and every
 * completed animation strips its inline styles.
 */
import { animate, inView, scroll } from 'motion';

/* Easing constants (GSAP mappings — one table so feel drift is reviewable):
 * power3.out → cubic-bezier(.215,.61,.355,1)
 * power2.out → cubic-bezier(.25,.46,.45,.94)
 * power4.out → cubic-bezier(.165,.84,.44,1)
 * expo-out   → cubic-bezier(.16,1,.3,1) */
const EASE_POWER3 = [0.215, 0.61, 0.355, 1];
const EASE_POWER2 = [0.25, 0.46, 0.45, 0.94];
const EASE_POWER4 = [0.165, 0.84, 0.44, 1];
const EASE_EXPO = [0.16, 1, 0.3, 1];

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Strip the inline styles an animation left behind so the stylesheet
 *  governs again (no containing-block side effects on sticky children). */
function clearInline(el, props) {
    try {
        props.forEach((p) => { el.style[p] = ''; });
    } catch (err) { /* non-fatal */ }
}

/* ==========================================================================
 * ENTRY — gates run BEFORE any hidden state is applied
 * ========================================================================== */
if (prefersReducedMotion()) {
    // No-op — content is already fully visible (no module-added inline styles).
} else {
    initHero();
    initMaskedReveals();
    initSectionReveals();
    initSecRules();
    initCounters();
    initTimelineDraw();
    initProgressBar();
}

/* --------------------------------------------------------------------------
 * Hero: staggered load-in (the h1 is handled by the masked reveal instead).
 * Hidden states applied synchronously at setup; every item animates once.
 * -------------------------------------------------------------------------- */
function initHero() {
    const items = document.querySelectorAll(
        '#home .section-tag, #home .hero-desc, #home .stat-card'
    );
    if (!items.length) return;

    const els = Array.from(items);
    els.forEach((el) => { el.style.opacity = '0'; }); // sync hidden state

    const controls = animate(els, { opacity: [0, 1], y: [24, 0] }, {
        duration: 0.8,
        ease: EASE_POWER3,
        delay: (i) => 0.15 + i * 0.12,
    });
    controls.finished.then(() => {
        els.forEach((el) => clearInline(el, ['opacity', 'transform']));
    }).catch(() => { /* content already at final state via keyframes */ });
}

/* --------------------------------------------------------------------------
 * Masked line reveals: hero h1 + section titles only.
 * -------------------------------------------------------------------------- */
function initMaskedReveals() {
    const targets = document.querySelectorAll(
        '.hero-title, .section-title, .experience-title, .contact-title'
    );
    if (!targets.length) return;

    const els = Array.from(targets);
    els.forEach((el) => { el.style.opacity = '0'; }); // sync hidden state

    let done = false;
    let stopFns = [];

    function reveal() {
        if (done) return;
        done = true;

        try {
            els.forEach(splitTextNodes);
        } catch (err) {
            console.warn('animations: masked reveal setup failed; showing titles plainly.', err);
            showPlain();
            return;
        }

        try {
            els.forEach((el) => {
                const words = el.querySelectorAll('.w > i');
                const isHero = el.classList.contains('hero-title');

                // Synchronously mask the words (start state for the y travel).
                // Keyframes ['110%','0%'] re-assert the start, this keeps the
                // pre-trigger frame correct for scroll-triggered titles.
                if (words.length) {
                    words.forEach((w) => { w.style.transform = 'translateY(110%)'; });
                }

                if (isHero) {
                    playReveal(el, words, 0.25, true);
                } else {
                    const stop = inView(el, () => {
                        playReveal(el, words, 0, false);
                        // once semantics: returning undefined unobserves
                    }, { amount: 0.3 });
                    if (typeof stop === 'function') stopFns.push(stop);
                }
            });
        } catch (err) {
            console.warn('animations: masked reveal failed; showing titles plainly.', err);
            showPlain();
        }
    }

    function playReveal(el, words, delay, immediateCleanup) {
        animate(el, { opacity: [0, 1] }, {
            duration: 0.5,
            ease: EASE_POWER2,
            delay,
        }).finished.then(() => {
            el.style.opacity = '';
        }).catch(() => { el.style.opacity = '1'; });

        if (!words || !words.length) return;
        const list = Array.from(words);
        animate(list, { y: ['110%', '0%'] }, {
            duration: 1,
            ease: EASE_POWER4,
            delay: delay > 0 ? (i) => delay + i * 0.05 : (i) => i * 0.05,
        }).finished.then(() => {
            // failsafe: no residual transforms anywhere near sticky parents
            list.forEach((w) => { w.style.transform = ''; });
        }).catch(() => {
            list.forEach((w) => { w.style.transform = ''; });
        });
    }

    /** Last-resort failsafe: every title fully visible, no transforms left. */
    function showPlain() {
        stopFns.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
        els.forEach((el) => {
            el.style.opacity = '1';
            const words = el.querySelectorAll('.w > i');
            words.forEach((w) => { w.style.transform = ''; });
        });
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(reveal).catch(reveal);
        // Failsafe: never leave a title stuck at opacity 0.
        window.setTimeout(reveal, 2500);
    } else {
        reveal();
    }
}

/**
 * Wrap every word of every TEXT NODE in <span class="w"><i>word</i></span>.
 * Element children (<span>, <br>, comments) are untouched — only text node
 * values are split, and whitespace between nodes is preserved verbatim.
 *
 * Args:
 *     el: The heading element to split (idempotent).
 */
function splitTextNodes(el) {
    if (!el || el.dataset.split === 'true') return;

    const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (label) el.setAttribute('aria-label', label);

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    textNodes.forEach((textNode) => {
        const text = textNode.nodeValue;
        if (!text || !text.trim()) return; // keep pure whitespace as-is

        const frag = document.createDocumentFragment();
        text.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
                frag.appendChild(document.createTextNode(part));
                return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            w.setAttribute('aria-hidden', 'true');
            const i = document.createElement('i');
            i.textContent = part; // never innerHTML
            w.appendChild(i);
            frag.appendChild(w);
        });
        textNode.parentNode.replaceChild(frag, textNode);
    });

    el.dataset.split = 'true';
}

/* --------------------------------------------------------------------------
 * Section reveals: fade-up with stagger on scroll, once per section.
 * Titles are excluded — they get the masked reveal above (a transform on the
 * same element would fight the word split). Sticky project cards are
 * transformed through their CHILDREN only (.project-index/.project-main):
 * a transformed .projects-grid or .project-card would break position:sticky.
 * -------------------------------------------------------------------------- */
function initSectionReveals() {
    const revealSelectors = [
        '.section-tag',
        '.skill-group',
        '.service-row',
        '.project-index',
        '.project-main',
        '.timeline-item',
        '.about-grid > div',
        '.contact-info',
        '.contact-form-card',
        '.experience-aside-inner',
        '.footer-inner',
    ];

    document.querySelectorAll('section, footer').forEach((section) => {
        if (section.id === 'home') return; // hero handled on load

        const items = [];
        revealSelectors.forEach((sel) => {
            if (sel === '.section-tag') return; // animated with the rule below
            section.querySelectorAll(sel).forEach((el) => items.push(el));
        });
        if (!items.length) return;

        items.forEach((el) => { el.style.opacity = '0'; }); // sync hidden state

        let fired = false;
        const stop = inView(section, () => {
            if (fired) return false; // safety net for re-entry
            fired = true;
            const controls = animate(items, { opacity: [0, 1], y: [30, 0] }, {
                duration: 0.7,
                ease: EASE_POWER2,
                delay: (i) => i * 0.1,
            });
            controls.finished.then(() => {
                items.forEach((el) => clearInline(el, ['opacity', 'transform']));
            }).catch(() => {
                items.forEach((el) => { el.style.opacity = '1'; el.style.transform = ''; });
            });
            // returning undefined (not false) → unobserve → fires once
        }, { amount: 0.2 });
        if (typeof stop !== 'function' && window.console) {
            console.warn('animations: inView did not return a stop function.');
        }
    });
}

/* --------------------------------------------------------------------------
 * Section number rules: the signature hairline draws itself left→right,
 * then releases its inline transform. (.section-tag rides the same trigger.)
 * -------------------------------------------------------------------------- */
function initSecRules() {
    document.querySelectorAll('section, footer').forEach((section) => {
        if (section.id === 'home') return; // hero rules stay visible on load

        const rule = section.querySelector('.sec-rule');
        const tag = section.querySelector('.section-tag');
        if (!rule && !tag) return;

        if (rule) {
            rule.style.transformOrigin = 'left';
            rule.style.transform = 'scaleX(0)'; // sync hidden state
        }
        if (tag) tag.style.opacity = '0';

        let fired = false;
        inView(section, () => {
            if (fired) return false;
            fired = true;
            if (rule) {
                animate(rule, { scaleX: [0, 1] }, {
                    duration: 1.0,
                    ease: EASE_EXPO,
                }).finished.then(() => clearInline(rule, ['transform']))
                    .catch(() => { rule.style.transform = ''; });
            }
            if (tag) {
                animate(tag, { opacity: [0, 1], y: [12, 0] }, {
                    duration: 0.45,
                    ease: EASE_EXPO,
                    delay: 0.05,
                }).finished.then(() => clearInline(tag, ['opacity', 'transform']))
                    .catch(() => { tag.style.opacity = '1'; tag.style.transform = ''; });
            }
        }, { amount: 0.25 });
    });
}

/* --------------------------------------------------------------------------
 * Animated counters: 4+, 50+, 99.9% — suffixes stay in the DOM.
 * .stat-value is never split into words (counters rewrite textContent).
 * -------------------------------------------------------------------------- */
function initCounters() {
    document.querySelectorAll('.stat-value').forEach((el) => {
        const raw = el.textContent.trim();
        const match = raw.match(/^([\d.]+)(.*)$/);
        if (!match) return;
        const target = parseFloat(match[1]);
        const suffix = match[2]; // "+" or "%" etc.
        const decimals = (match[1].split('.')[1] || '').length;

        el.textContent = (0).toFixed(decimals) + suffix; // sync initial value

        let fired = false;
        inView(el, () => {
            if (fired) return false;
            fired = true;
            animate(0, target, {
                duration: 1.6,
                ease: EASE_POWER2,
                onUpdate: (val) => {
                    el.textContent = val.toFixed(decimals) + suffix;
                },
                onComplete: () => {
                    el.textContent = target.toFixed(decimals) + suffix;
                },
            });
        }, { amount: 0.8 });
    });
}

/* --------------------------------------------------------------------------
 * Timeline line: scaleY draw on scroll (scroll-linked, not time-based).
 * JS-path scroll callback — deterministic across browsers, Lenis-compatible.
 * -------------------------------------------------------------------------- */
function initTimelineDraw() {
    document.querySelectorAll('.timeline-line').forEach((line) => {
        line.style.transformOrigin = 'top center';
        line.style.transform = 'scaleY(0)'; // sync hidden state

        scroll((progress) => {
            line.style.transform = 'scaleY(' + Math.min(Math.max(progress, 0), 1) + ')';
        }, {
            target: line.parentElement,
            offset: ['start 70%', 'end 60%'],
        });
    });
}

/* --------------------------------------------------------------------------
 * Scroll progress hairline under the header. The element is JS-created in a
 * JS-gated path, so it can never exist without animation capability.
 * -------------------------------------------------------------------------- */
function initProgressBar() {
    if (document.getElementById('progress-bar')) return;
    const header = document.querySelector('.site-header');
    if (!header) return;

    const bar = document.createElement('div');
    bar.id = 'progress-bar';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.position = 'absolute';
    bar.style.insetInline = '0';
    bar.style.bottom = '-1px';
    bar.style.height = '2px';
    bar.style.background = 'var(--accent)';
    bar.style.transform = 'scaleX(0)';
    bar.style.transformOrigin = 'left';
    bar.style.zIndex = '99';
    bar.style.pointerEvents = 'none';
    header.appendChild(bar);

    scroll((progress) => {
        bar.style.transform = 'scaleX(' + Math.min(Math.max(progress, 0), 1) + ')';
    });
}
