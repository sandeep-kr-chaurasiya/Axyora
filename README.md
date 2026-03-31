# 🧠 Axyora - Your Personal AI Memory Companion

**Axyora** is an intelligent mobile and web application that helps you organize, search, and interact with your personal memories (photos, videos, documents). Powered by advanced AI, it understands context and provides instant, natural access to your digital life.

---

## 🎯 Features

✨ **AI-Powered Search**
- Natural language queries ("Show me sunset photos from last summer")
- Semantic understanding of images, videos, and documents
- Multi-modal search across all media types

📸 **Smart Memory Organization**
- Automatic indexing of photos, videos, and documents
- Intelligent classification and tagging
- Privacy-first approach (on-device processing where possible)

💬 **Conversational Interface**
- Chat with your AI memory assistant
- Natural responses that feel like talking to a personal assistant
- Context-aware suggestions

🔒 **Privacy & Security**
- All data processed locally or securely
- No unnecessary cloud storage
- User-controlled data retention

---

## 📁 Project Structure

```
📦 Axyora/
├── 📱 mobile/              # React Native mobile app (iOS/Android)
│   ├── src/
│   │   ├── components/     # Premium UI components (PremiumButton, PremiumInput, MessageBubble, ChatImageGrid, etc.)
│   │   ├── screens/        # App screens (Chat, Auth, Settings, Processing, Permissions, Onboarding)
│   │   ├── hooks/          # Custom React hooks (useChat, useAuth, useIndexingQueue, useAppLifecycle)
│   │   ├── services/       # API client and file services
│   │   ├── theme/          # Design system (colors, spacing, animations, typography)
│   │   ├── navigation/     # React Navigation setup
│   │   └── types/          # TypeScript type definitions
│   ├── package.json        # Dependencies
│   ├── app.json            # Expo configuration
│   └── tsconfig.json       # TypeScript config
│
├── 🤖 ai-engine/           # Python FastAPI backend
│   ├── main.py             # FastAPI server entry point
│   ├── query_engine.py     # LLM-powered query engine
│   ├── vector_store.py     # Vector database (embeddings)
│   ├── ingestion.py        # File ingestion pipeline
│   ├── metadata_db.py      # Metadata storage
│   ├── groq_client.py      # Groq LLM integration with response validation
│   ├── local_storage.py    # Progress tracking storage
│   ├── requirements.txt    # Python dependencies
│   ├── production_config.py# Production environment config
│   └── logs/               # Application logs
│
├── README.md               # This file
├── .gitignore             # Git ignore rules
└── deploy.sh              # Deployment automation script
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ & npm/yarn
- **Python** 3.10+
- **iOS/Android SDK** (for mobile development)
- **Expo CLI** (`npm install -g expo-cli`)

### Installation

#### 1. Clone & Setup

```bash
git clone <repo-url>
cd Axyora
```

#### 2. Mobile App Setup

```bash
cd mobile
npm install
```

#### 3. Backend Setup

```bash
cd ai-engine
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 🏃 Running the App

### Start Backend (AI Engine)

```bash
cd ai-engine
source venv/bin/activate
python main.py
```

Backend runs on `http://localhost:8000`

### Start Mobile App (Development)

```bash
cd mobile
npm start -- --dev-client
```

Then choose:
- `i` for iOS simulator
- `a` for Android emulator
- Scan QR code with Expo Go app

---

## 📱 Mobile App Architecture

### Design System (`src/theme/`)

The app uses a **premium glassmorphic design** inspired by modern interfaces. Located in `src/theme/`:

**Theme Files:**
- `colors.ts` - Deep black background, purple-blue-cyan gradients, glassmorphic surfaces
- `spacing.ts` - 8-step scale (4px → 48px), glass effects, shadow system, premium typography
- `animations.ts` - 8+ predefined animations (fade, slide, scale, pulse, glow, shake, spin)
- `index.ts` - Centralized theme export

**Design Tokens:**
- **Colors**: Deep black background (#0A0A0A), purple primary, glassmorphic surfaces
- **Spacing**: Consistent xs (4px) through xxxl (48px)
- **Typography**: Premium scale with letter spacing (h1-h4, body variants, captions)
- **Shadows**: Soft elevation system (sm, md, lg, xl, glow)
- **Glass Effects**: Light, medium, dark variants with blur

### Key Screens

1. **ChatScreen** - Main conversational interface with image results grid
2. **AuthScreen** - Login/signup (Firebase integration)
3. **SettingsScreen** - App configuration and data management
4. **ProcessingScreen** - Real-time indexing progress
5. **EnhancedPermissionsScreen** - Permission requests with clear explanations

### Key Components

- **MessageBubble** - Animated chat messages (user right, AI left)
- **ChatImageGrid** - 3-column image grid with score badges
- **PremiumButton** - 6+ variants with smooth animations
- **PremiumInput** - Focus-animated text input with glass effect
- **LoadingIndicators** - Skeleton, typing indicator, spinner

### Hooks

- **useChat** - Manage messages and conversation state
- **useAuth** - Authentication state and login/logout
- **useIndexingQueue** - File processing queue management
- **useAppLifecycle** - App lifecycle events (resume, background)

---

## 🤖 Backend (AI Engine)

### Architecture

**FastAPI Server** Processing pipeline:

1. **File Ingestion** (`ingestion.py`)
   - Accepts images, videos, documents
   - Generates embeddings and metadata

2. **Vector Store** (`vector_store.py`)
   - Stores embeddings for semantic search
   - Similarity-based retrieval

3. **Query Engine** (`query_engine.py`)
   - Processes natural language queries
   - Retrieves relevant results (images, videos, documents)

4. **LLM Integration** (`groq_client.py`)
   - Generates conversational responses
   - Validates and formats results

5. **Metadata Database** (`metadata_db.py`)
   - Stores file metadata
   - Tracks processing status

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/query` | POST | Search query with LLM |
| `/process-file` | POST | Submit file for indexing |
| `/status/{jobId}` | GET | Check processing status |
| `/health` | GET | Service health check |

---

## 💾 Data Flow

```
User Query (Mobile) 
    ↓
Chat API Client (React Query)
    ↓
FastAPI Backend
    ↓
Vector Store (Similarity Search)
    ↓
Retrieved Results + LLM Generated Response
    ↓
Chat Bubble Display + Image Grid
```

---

## 🔧 Development Guide

### Adding a New Screen

1. Create component in `mobile/src/screens/ScreenName.tsx`
2. Use theme tokens: `colors`, `spacing`, `typography`, `shadows`, `borderRadii`
3. Add to navigation in `src/navigation/AppNavigator.tsx`
4. Use premium components: `PremiumButton`, `PremiumInput`, `PremiumCard`, etc.

### Adding a New API Endpoint

1. Create route in `ai-engine/main.py`
2. Use existing services (query_engine, ingestion, etc.)
3. Add response validation
4. Update mobile API client in `mobile/src/services/apiClient.ts`

### Styling

- **Never hardcode colors** - Use `colors` from theme
- **Never hardcode spacing** - Use `spacing` tokens
- **Always use theme shadows** - `shadows.sm`, `shadows.md`, etc.
- **Animate with theme** - Use predefined animations from `animations.ts`

---

## 🐛 Debugging

### Mobile App Logs

```bash
# View Metro bundler logs
npm start

# View device logs (iOS)
xcrun simctl spawn booted log stream --level=debug

# React Native debugger
npm start -- --dev-client
```

### Backend Logs

```bash
# Server logs
tail -f ai-engine/logs/app.log

# Request logging
# Check query_engine.py for detailed logs
```

---

## 📦 Dependencies

### Mobile
- React Native 0.81+
- React 19
- Expo 54+
- React Navigation 6+
- AsyncStorage for persistence

### Backend
- FastAPI 0.100+
- Python 3.10+
- Pydantic for validation
- Various ML/embeddings libraries

See `mobile/package.json` and `ai-engine/requirements.txt` for full lists.

---

## ✨ Premium UI Features

- **Glassmorphism** - Semi-transparent surfaces with blur effects
- **Smooth Animations** - All transitions use easing curves
- **Soft Shadows** - Depth without hard borders
- **Premium Typography** - Large, bold, letterspaced headings
- **Interactive Feedback** - Scale animations on press, focus states
- **Dark Mode Only** - Premium dark aesthetic throughout

---

## 🚀 Deployment

### Mobile
- Build for iOS: `npm run ios`
- Build for Android: `npm run android`
- EAS Build for app store: `eas build --platform ios`

### Backend
- Docker: Create `Dockerfile` in `ai-engine/`
- Cloud deployment: Firebase Cloud Run, AWS Lambda, etc.
- Environment variables: Copy `.env.example` to `.env`

---

## 📝 License

Private / Proprietary

---

## 👥 Contributing

1. Ensure feature branches follow naming: `feature/feature-name`
2. All code uses theme system (no hardcoded values)
3. Components should be reusable
4. Test on both iOS and Android
5. Update documentation for breaking changes

---

## 🎨 Recent Improvements

### Chat Experience
- ✅ Conversational AI responses with varied greetings
- ✅ Image grid filtering (removes HEIC files not supported on simulator)
- ✅ Max 6 images display with dynamic reflow
- ✅ Proper message alignment (user right, AI left)
- ✅ Smart response formatting matching actual displayed content

### Code Quality
- ✅ Removed unused components (Button.tsx, Input.tsx, SplashScreen.premium.tsx)
- ✅ Cleaned up redundant documentation
- ✅ Consolidated design system into single theme module
- ✅ Fixed component exports (PremiumButton, PremiumInput, PremiumCard)

### Backend
- ✅ Enhanced LLM response validation with better inversion detection
- ✅ Type-aware query matching
- ✅ Legitimate "no results" detection

---

## 📞 Support

For issues or questions:
- Check console output in Metro bundler (iOS): `npm start -- --dev-client`
- Review server logs in `ai-engine/logs/app.log`
- Check health endpoint: `curl http://localhost:8000/health`
- Verify file paths in ChatImageGrid component for custom file loading

---

**Built with ❤️ for your memories**
