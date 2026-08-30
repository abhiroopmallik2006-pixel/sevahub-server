# Layouts

## `frontend/index.html`

The HTML entry point contains one application root: `<div id="app" class="app"></div>`. `frontend/js/app.js` renders the active screen into that root.

## `frontend/js/app.js` — application shell

`render()` routes by the signed-in role. `renderUser()` and `renderWorker()` each create the dashboard shell: a `nav(...)` header, fluid `.container.dashboard` content region, summary cards, tab navigation, and an interactive content target. The same warm amber CTA, soft-gray surface, rounded cards, and responsive grid are shared throughout.
