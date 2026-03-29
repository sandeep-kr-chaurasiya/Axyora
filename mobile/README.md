# Axyora Mobile (React Native)

Production-ready mobile app for privacy-first memory indexing and query.

## Structure

- `src/screens` - Splash, onboarding, auth, permissions, processing, chat
- `src/components` - Animated logo, bubbles, search result card, progress timeline
- `src/hooks` - Auth, queue subscription, chat orchestration
- `src/services` - Firebase auth, API client, scanner, indexing queue

## Key Functional Features

- Real Firebase Email/Password authentication
- Real file scanning:
  - Media library images
  - Media library audio
  - App document directory
  - Explicit document picker import
- Async background indexing queue with progress events
- Incremental indexing skip using file fingerprint cache
- Chat asks real backend query endpoint and renders source references

## Run

```bash
cp .env.example .env
npm install
npm run start
```

Set `EXPO_PUBLIC_API_BASE_URL` to your API server (for device testing, use LAN IP).
