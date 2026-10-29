# sabbir-portfolio

A premium, dark, professional software-engineer portfolio for **Sabbir Hossain Rajib**
(Senior Software Engineer). Static site — no build step, no bundler.

## Structure

```
sabbir-portfolio/
├── index.html              # Single page (semantic HTML, relative paths only)
├── README.md
└── assets/
    ├── css/
    │   └── style.css       # Google Fonts @import + all custom CSS (no Tailwind)
    ├── js/
    │   ├── main.js         # Nav, mobile menu, counters hook, contact form, tilt, nav-highlight
    │   ├── three-scene.js  # Three.js module — one fixed canvas, three decorative "stations"
    │   └── animations.js   # GSAP + ScrollTrigger reveals, hero stagger, counters, timeline draw
    └── images/
        └── .gitkeep
```

## Sections

`#home` (hero) → `#about` → `#services` → `#stack` → `#experience` → `#work` → `#contact`

The navigation is ordered to match this scroll order, with a mobile hamburger
menu below `768px`.

## Run locally

Any static file server works. From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

> A local server is required (not `file://`) because the Three.js scene loads as
> an ES module via an `importmap`, which browsers block on the `file://` protocol.

## Third-party CDNs

- **Google Fonts** (Space Grotesk, Fira Code) — via `@import` in `style.css`
- **Font Awesome 6.4.0** — icons
- **GSAP 3.12.5 + ScrollTrigger** — scroll/load animations (classic UMD scripts)
- **Three.js 0.169.0** — pinned via `importmap` (jsDelivr), loaded as a module

## Progressive enhancement / fallbacks

- **No WebGL / failed renderer** → the 3D scene is skipped entirely; the site is a
  clean static gradient/grid portfolio (no broken canvas).
- **`prefers-reduced-motion: reduce`** → Three.js scene and all GSAP tweens are
  skipped; everything renders in its final visible state.
- **No JS / CDN failure** → all content is visible (hidden animation states are set
  with `gsap.set`, never as static CSS `opacity: 0`).
- **Tab hidden** → the WebGL render loop pauses (`visibilitychange`).
- The Three.js canvas is purely decorative (`aria-hidden="true"`,
  `pointer-events: none`); the DOM is the accessible/SEO source of truth.

## Contact form

Uses [FormSubmit.co](https://formsubmit.co) AJAX POST to
`sabbirhossainrajib.office@gmail.com` with hidden `_captcha=false` and
`_template=box`. If JS fails, the form still posts natively.

## Content

All names, roles, stats, skills, experience, projects, and contact details are the
original site content, preserved verbatim. Placeholder copy (e.g. the About bio and
service specifics) is clearly marked with `<!-- TODO(Sabbir): ... -->` HTML comments
— no facts were invented.
