# Shared UI components

This application uses vanilla JavaScript and HTML strings. It has no separately packaged shared component directory; the reusable primitives live in `frontend/js/app.js`.

## Reusable primitives

- `nav(title)`: signed-in navigation bar with identity, theme switch, and logout.
- `historyPanel(...)`: completed-service history card and date filter.
- `workerHTML(worker, serviceId)`: worker listing card with Book/Bargain actions.
- `chatBox()`: existing worker-chat floating panel.
- `api(path, options)`: authenticated JSON API client.

All primary visual styling is in `frontend/css/style.css`; responsive overrides are in `frontend/css/responsive.css`.
