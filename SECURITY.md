# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability, please report it privately via GitHub's [Security tab](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/security) using "Report a vulnerability."

**Do not open a public issue for security bugs.** Private vulnerability reporting helps us address vulnerabilities responsibly before disclosure.

## Supported versions

- **Latest `main` branch** — receives all updates and security fixes.
- Previous releases are not actively maintained.

## Security notes

### Local-first architecture

FarmFriend is a client-side SPA with no backend. All plan data is stored in browser localStorage. No data is transmitted to our servers — only to public, keyless APIs:

- **Weather data**: [Open-Meteo](https://open-meteo.com) (CC BY 4.0, requires attribution)
- **Soil data**: [ISRIC SoilGrids](https://soilgrids.org) (CC BY 4.0)
- **Climate data**: Open-Meteo archive and CMIP6 endpoints (public, keyless)
- **Other data sources**: Geocoding (Open-Meteo), flood risk, air quality, UV index (Open-Meteo), NASA POWER

### Third-party API considerations

- All APIs are **keyless and public** — no authentication required.
- Open-Meteo's free tier is for **non-commercial use**. Commercial deployments must subscribe to an Open-Meteo API plan.
- All data is fetched with CORS from your browser — inspect Network requests in DevTools to verify.
- Build your own backend (swap `VITE_API_BASE_URL`) to add authentication, caching, or commercial licensing.

### Browser security

- Plans are stored in `localStorage` under the key `ff-pro:v1` — not shared across origins or domains.
- Clear your browser cache/storage to delete all local plans.
- FarmFriend does not set cookies or use tracking pixels.

## Keep your deployment secure

- Run `npm run check:private` before committing to prevent accidental secrets in code.
- If deploying to a custom domain with a backend, secure your API endpoint and verify CORS headers.
- Use HTTPS in production.
