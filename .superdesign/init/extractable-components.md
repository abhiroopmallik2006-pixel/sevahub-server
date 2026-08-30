# Extractable UI components

## AppNavigation

- Source: `frontend/js/app.js` (`nav`)
- Category: layout
- Description: compact signed-in navigation with SevaHub wordmark, identity pill, theme toggle, logout.
- Extractable props: role, displayName.
- Hardcoded: existing button styling and navigation shell.

## DashboardCard

- Source: `frontend/js/app.js` and `frontend/css/style.css`
- Category: basic
- Description: rounded surface card used for stats, services, workers, forms and workflow details.
- Extractable props: title, content, status.
- Hardcoded: card visual treatment.

## StatusPill

- Source: `frontend/css/style.css`
- Category: basic
- Description: compact booking/verification state indicator.
- Extractable props: label, tone.
- Hardcoded: rounded pill shape and type scale.
