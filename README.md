# Axyora

Axyora is a local-first AI memory engine with a premium React Native client and a FastAPI backend. It indexes your photos/documents locally, builds embeddings, and lets you chat with your own memory using natural language.

---

## What’s Included

- **Mobile app (Expo / React Native)**: onboarding → auth → permissions → discovery → processing → chat
- **AI engine (FastAPI)**: ingestion, embeddings, vector search, Groq reasoning, local metadata storage
- **Local-first design**: your files are processed on-device or locally, not uploaded by default

---

## Repository Structure

```
Axyora/
├─ mobile/                 # React Native (Expo) app
│  ├─ src/
│  │  ├─ screens/          # App screens (Splash, Onboarding, Auth, Permissions, Discovery, Processing, Chat, Settings)
│  │  ├─ components/       # UI components (MessageBubble, ChatImageGrid, etc.)
│  │  ├─ hooks/            # Hooks (useAuth, useChat, useAppLifecycle)
│  │  ├─ services/         # API client, queue, scanner
│  │  ├─ theme/            # Design system (colors, spacing, animations, typography)
│  │  └─ navigation/       # Navigation root
│  ├─ App.tsx              # App entry
│  └─ package.json
├─ ai-engine/              # FastAPI backend
│  ├─ main.py              # API entry + background pipeline
│  ├─ embeddings.py        # Embedding engine (BGE)
│  ├─ vector_store.py      # FAISS vector DB
│  ├─ processor.py         # File processing (PDF/DOCX/TXT/Images/Audio)
│  ├─ query_engine.py      # RAG pipeline
│  └─ production_config.py # Environment/tuning settings
└─ README.md
```

---

## Requirements

### Mobile
- Node.js 18+
- Expo CLI (via `npm`)
- iOS Simulator / Android Emulator

### AI Engine
- Python 3.10+
- `pip` / `venv`
- (Optional) Groq API key for cloud reasoning

---

## Setup

### 1) Mobile App

```bash
cd mobile
npm install
```

Create `.env.local` (or use `.env.example`) with Firebase + API base:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

Run:

```bash
npm run ios
# or
npm run android
```

### 2) AI Engine

```bash
cd ai-engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Optional env:

```
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
```

Run:

```bash
python main.py
```

---

## Core Flow

1. **Splash** → **Onboarding** → **Auth**
2. **Permissions** (media access)
3. **Discovery** (scan device) → **Processing** (queue + progress)
4. **Chat** (natural language search + results)

---

## Key Mobile Components

- `ChatScreen`: primary UI + message stream
- `ChatImageGrid`: image results grid
- `MessageBubble`: aligned chat bubbles
- `ProcessingScreen`: queue and live progress
- `SettingsScreen`: system stats + controls

---

## Key Backend Components

- `processor.py`: file parsing and chunking
- `embeddings.py`: vector embeddings
- `vector_store.py`: similarity search
- `query_engine.py`: RAG + reasoning
- `groq_client.py`: cloud LLM (optional)

---

## API Endpoints (AI Engine)

- `GET /health` – service health
- `POST /process-file` – upload and index
- `GET /status/{job_id}` – job state
- `POST /query` – ask memory
- `POST /search-images` – image search
- `GET /index-stats?user_id=...` – user stats
- `GET /stats/file-types/{user_id}` – file type stats
- `DELETE /clear?user_id=...` – clear user data

---

## Troubleshooting

- **iOS build error**: run `npm run ios` again after `npm install`
- **Metro errors**: `npm start -- --clear`
- **No Groq responses**: set `GROQ_API_KEY`
- **Slow indexing**: tune `PIPELINE_WORKERS` and `EMBED_BATCH_SIZE` in `ai-engine/production_config.py`

---

## Performance Tuning

`ai-engine/production_config.py` includes knobs for:
- Pipeline workers
- Queue size
- Embedding batch size
- Cache TTL

Adjust per device and test stability before production use.

---

## License

Private / Proprietary
