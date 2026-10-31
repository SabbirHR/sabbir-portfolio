# sabbir-portfolio

A **Neo-Technical Editorial** portfolio for **Sabbir Hossain Rajib**
(Senior Software Engineer). Dark, sharp-cornered, hairline-ruled layout with a
lime (`#c8ff2f`) accent and a single WebGL "Mercury Sheet" in the hero.
Static site — no build step, no bundler.

## Structure

```
sabbir-portfolio/
├── index.html              # Single page (semantic HTML, relative paths only)
├── README.md
└── assets/
    ├── css/
    │   └── style.css       # Design tokens + all custom CSS (fonts via <link>, no @import)
    ├── js/
    │   ├── main.js         # Nav, mobile menu, Dhaka clock, grain pause, contact form
    │   ├── cursor.js       # Custom cursor + magnetic buttons (gated: fine pointer, GSAP)
    │   ├── lenis-init.js   # Optional smooth scroll (window mode, droppable)
    │   ├── three-scene.js  # Three.js module — hero "Mercury Sheet" displaced plane
    │   └── animations.js   # GSAP reveals, masked line reveals, counters, timeline draw
    └── images/
        └── .gitkeep
```

## Design system

Tokens live in `assets/css/style.css` `:root`:

```css
--bg:#050505; --bg-raised:#0a0a0b; --bg-hover:#0e0e10;
--ink:#ededed; --ink-2/3/4 (66/42/26% ink); --hairline/2 (10/18% white);
--accent:#c8ff2f; --accent-ink:#050505; --err:#ff5c5c;
```

Rules: `border-radius: 0` everywhere, borders are `1px solid var(--hairline)`,
the only shadow allowed is `0 0 0 1px var(--accent)` (focus/hover ring),
headings are left-aligned weight 500 / `-0.04em` / `.96` line-height, mono
labels are uppercase with `.16em` tracking. Type scale uses `clamp()`
(`--t-display` … `--t-micro`), container is 84rem, sections are
`padding-block: clamp(5rem,14vh,9rem)` with asymmetric 5/7, 4/8, 7/5, 6/6 grids.
Fonts: Space Grotesk + Fira Code, loaded with `<link>` tags in `<head>`.

## Sections

`#home` (hero) → `#about` → `#services` → `#stack` → `#experience` → `#work`
→ `#contact`, each with a mono section number in the left gutter. A full-bleed
skills marquee sits between hero and about; the footer carries a live
`Asia/Dhaka` clock (`<time id="local-time">`).

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

> A local server is required (not `file://`) because the Three.js scene loads as
> an ES module via an `importmap`, which browsers block on the `file://` protocol.

## QA harness

`tests/` holds a Puppeteer-driven browser smoke harness — the parity gate for
any animation/engine change. It runs **headed** Chrome on a local X display
(chrome-headless-shell reports `pointer:none`, which would falsely fail the
`pointer:fine` gates) against a throwaway `python3 -m http.server`.

```bash
tests/run-qa.sh          # full run: sections A–H (10 browser jobs)
QA_PORT=8200 tests/run-qa.sh          # different port
QA_DISPLAY=:0 CHROME_PATH=/usr/bin/google-chrome tests/run-qa.sh   # env overrides
```

Requirements: `node` ≥ 18, `google-chrome`, an X display (`QA_DISPLAY`,
default `:0`), and `puppeteer-core` resolvable — installed normally, pointed
to by `PUPPETEER_CORE_PATH`, or present in `/tmp/opencode/node_modules`. The
repo itself stays buildless: no `package.json`, no committed `node_modules`.

Sections (each runs in its own Chrome process; a crash only costs that job):

| Section | What it proves |
|---------|----------------|
| A | Reveals, cursor, Lenis, sticky stack, anchors, focus ring @1440 |
| B | No horizontal scrollbar + sticky/ghost breakpoints at 320/768/1440 |
| C | Hamburger opens, Escape closes |
| D | JS disabled: every section, all copy, no hidden text |
| E | **All cross-origin CDNs + the local animation module aborted**: no text node left hidden by script styles; counters exact |
| F | **`prefers-reduced-motion`**: everything visible, nothing animating, no hidden text |
| G | WebGL unavailable: canvas hidden, CSS hero fill, content visible |
| H | After a full-page scroll: no residual transforms on sticky participants |

Exit code 0 = all checks pass; per-check `PASS`/`FAIL` lines land in
`$QA_LOG_DIR/qa-all.log` (default `/tmp/opencode/qa-all.log`).

## Third-party CDNs

- **Google Fonts** (Space Grotesk, Fira Code) — `<link>` in `index.html`
- **Font Awesome 6.4.0** — icons
- **GSAP 3.12.5 + ScrollTrigger** — scroll/load animations (classic UMD scripts)
- **Lenis 1.1.18** — optional smooth scrolling (see drop instructions below)
- **Three.js 0.169.0** — pinned via `importmap` (jsDelivr), loaded as a module

## Progressive enhancement / fallbacks

- **No WebGL / failed renderer** → the canvas is hidden by the bootstrap in
  `three-scene.js`; `.hero::before` keeps a static lime radial (~6%) + grain
  fill, so the hero never looks empty.
- **`prefers-reduced-motion: reduce`** → the WebGL scene renders ONE static
  frame (uTime 0, no loop); GSAP tweens, masked reveals, the marquee, the
  grain animation, the custom cursor and Lenis are all skipped; everything
  renders in its final visible state.
- **No JS / GSAP CDN blocked** → all content is visible: hidden animation
  states are set with `gsap.set()` (never static CSS), and the masked-reveal
  split only runs after GSAP is confirmed present (with a 2.5s failsafe that
  forces titles visible).
- **Context loss** → `webglcontextlost` pauses the loop and
  `webglcontextrestored` resumes it (Android drops contexts on backgrounding);
  `visibilitychange` pauses everything while the tab is hidden.
- **Custom cursor fails** → `cursor:none` is only applied through
  `html.has-cursor`, added by `cursor.js` after successful init, so a failed
  script always leaves the native cursor.
- **Lenis fails** → wrapped in try/catch with a self-disabling raf; the site
  keeps native scrolling and `scroll-behavior:smooth`.
- The Three.js canvas and the marquee are decorative (`aria-hidden`,
  `pointer-events:none`); the DOM is the accessible/SEO source of truth.

### Dropping Lenis

Remove the two script tags from `index.html`
(`cdn.jsdelivr.net/npm/lenis@1.1.18` + `assets/js/lenis-init.js`) and delete
`assets/js/lenis-init.js`. Nothing else depends on it. Do this if any
sticky/anchor/scroll regression is observed.

## Contact form

Uses [FormSubmit.co](https://formsubmit.co) AJAX POST to
`sabbirhossainrajib.office@gmail.com` with hidden `_captcha=false` and
`_template=box`. If JS fails, the form still posts natively.

## Smoke checklist

Run after any visual or behavioural change:

- [ ] Contact form POSTs (FormSubmit AJAX resolves; `#form-status` reports)
- [ ] Nav active state follows the scroll position (lime underline wipe)
- [ ] Hamburger opens/closes; Escape closes and returns focus to the toggle
- [ ] With JavaScript disabled: every section, the form, and all copy render
- [ ] With the GSAP CDN blocked: no content stays hidden (`gsap.set` only)
- [ ] With `prefers-reduced-motion`: content visible, marquee static, one
      static WebGL frame (or CSS fill if WebGL is off)
- [ ] WebGL disabled: hero shows the lime radial + grain CSS fill
- [ ] No horizontal scrollbar at 320px, 768px, 1440px
- [ ] Keyboard: every link/button/input shows the lime `:focus-visible` outline
- [ ] No console errors; no 404s in the network tab
- [ ] Project cards stack with CSS sticky on ≥768px and flow normally below
      (no overflow on `.section`/`.container`/`.projects-grid`)
- [ ] Footer clock ticks in Asia/Dhaka time and pauses on tab hide

## Content

All names, roles, stats, skills, experience, projects, and contact details are the
original site content, preserved verbatim. Placeholder copy (e.g. the About bio and
service specifics) is clearly marked with `<!-- TODO(Sabbir): ... -->` HTML comments
— no facts were invented. Structural additions (section numbers `01`–`07`,
`philosophy.php` filename, project indices `01 / 03`, marquee terms copied from
the skills list, the Dhaka clock) carry no new claims.
