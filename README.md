# InterSystems Management Portal Frontend

A frontend management portal for the InterSystems SysAdmin API v2, designed as a contest-ready operator console for InterSystems IRIS 2026.2 and compatible Community Edition environments.

This project delivers a modern React UI focused on fast administration workflows, safe token handling, responsive operations, and a clean demo story for the **InterSystems Programming Contest: Build Your Own Management Portal**.

## Why this project

The goal is to provide a practical, open-source frontend for the SysAdmin API v2 that feels closer to a real operator console than a raw API explorer. The portal emphasizes:

- quick authentication and token refresh workflows
- health and platform visibility
- job and package operations from one place
- a generic operator console for direct endpoint execution
- responsive UI and better empty/error states
- contest-friendly documentation and demo flow

## Current scope

The portal is intentionally frontend-only. It expects the SysAdmin API v2 to be reachable either:

- on the same origin, or
- through a reverse proxy / CORS-enabled deployment

Default API base URL: `/api/admin`

## Key features

### Authentication and session UX

- login with access token extraction from common response fields
- refresh token support when exposed by the backend
- revoke/logout actions
- in-memory token storage only
- token expiry countdown when expiry can be inferred from a JWT or response payload

### Operator dashboard

- overview tab with status-oriented cards and quick actions
- domain explorer with search and filtering
- operator console for custom requests
- request history with recent activity tracking
- settings panel for UI behavior

### Verified functional areas

These areas are implemented against currently verified paths from the SysAdmin API specification work already reviewed for this submission:

- authentication
- instance / system information
- jobs
- packages

### Placeholder sections for contest-complete breadth

The contest brief calls for broad portal coverage. This build includes explicit placeholder cards for the following domains where endpoint verification is still pending and should be finalized against the latest spec before publication:

- web applications and REST APIs
- permission management
- security and secrets
- task management
- OS management
- logs

These sections are visibly marked in the UI so the submission stays honest about what is already wired versus what still needs endpoint confirmation.

## UX improvements included

Compared with a basic API frontend, this version adds:

- dark mode by default
- responsive layout improvements
- error boundary protection
- contextual help text
- better validation and form feedback
- search/filter support in domain browsing
- auto-polling for live operational views
- saved UI preferences using `window.name`
- empty states and richer notices
- recent request history

## Repository contents

- `intersystems_management_portal.jsx` - the single-file React portal component
- `README.md` - project overview and setup guide
- `OPENEXCHANGE_SUBMISSION.md` - ready-to-paste Open Exchange submission copy
- `LICENSE` - open-source license text
- `DEMO_ASSETS_CHECKLIST.md` - screenshot and demo video shot list
- `SUBMISSION_CHECKLIST.md` - final publication checklist

## Technical notes

- React single-file component for easy review and portability
- uses `lucide-react` icons
- uses shadcn/ui components
- designed for a frontend-only deployment model
- stores auth tokens in memory only
- stores UI preferences in `window.name`
- default theme is dark

## Local setup

This repository centers on a single React component file. To run it locally, place it inside a React application that already provides:

- React
- Tailwind CSS
- shadcn/ui components exposed through `@/components/ui`
- `lucide-react`

A practical setup path is:

1. Create or use an existing React app with Tailwind configured.
2. Install and configure shadcn/ui in that app.
3. Install `lucide-react`.
4. Replace your root app component with `intersystems_management_portal.jsx`.
5. Ensure the backend SysAdmin API v2 is reachable from the browser.
6. Start the frontend and sign in against your IRIS environment.

## Backend prerequisites

Before running the portal, confirm:

1. InterSystems IRIS or InterSystems IRIS for Health Community Edition is available.
2. The SysAdmin API v2 is enabled.
3. Browser access is allowed through same-origin hosting or CORS / reverse proxy configuration.
4. The authenticated user has permission to access the relevant administrative endpoints.

## Recommended demo environment

For the cleanest contest demo:

- run against IRIS Community Edition or IRIS for Health Community Edition
- expose the API at `/api/admin` through same-origin routing if possible
- use demo-safe credentials with limited scope
- seed the environment with a few jobs and package results so the interface shows meaningful data immediately

## Demo flow

A short contest demo can follow this order:

1. Open the portal and show the default dark UI.
2. Log in to the SysAdmin API v2.
3. Show token countdown and session controls.
4. Visit Overview for health and platform visibility.
5. Open Domains and filter by keyword.
6. Show Jobs management actions.
7. Show Packages inspection or browsing.
8. Use the Operator Console for a direct request.
9. Open Request History.
10. End in Settings, highlighting saved preferences.

## Security notes

- access and refresh tokens are kept in memory only
- preferences are non-sensitive UI settings only
- no localStorage or sessionStorage persistence is used for tokens
- production deployments should use HTTPS and least-privilege API credentials

## Known limitations

- some contest-required domains are currently represented by clearly labeled placeholders until endpoint verification is completed against the latest SysAdmin API v2 paths
- this repository provides the frontend portal component, not a bundled production deployment shell
- runtime behavior depends on the target environment exposing compatible SysAdmin API responses

## Why this is contest-ready

This submission is aimed at judges and operators, not just developers reading code. It demonstrates:

- real administrative workflows
- a polished UI layer over the SysAdmin API
- a credible path from prototype to practical portal
- honest handling of verified versus pending endpoint coverage
- complete submission materials for GitHub/GitLab and Open Exchange

## Next recommended step after submission

Finalize the unverified domain mappings against the latest SysAdmin API specification and add screenshots plus a short walkthrough video using the checklist in `DEMO_ASSETS_CHECKLIST.md`.