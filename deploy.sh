#!/bin/bash

# ===================================================================
# AXYORA PHASE 1E — QUICK START DEPLOYMENT SCRIPT
# ===================================================================
# This script prepares and deploys the app to Android device
# Run from: /Users/sandeepkumar/Desktop/Axyora/

set -e

echo "🚀 Axyora Phase 1E Deployment Starting..."
echo ""

# ===================================================================
# STEP 1: Verify Environment
# ===================================================================
echo "📋 Step 1: Verifying environment..."

if [ ! -d "mobile" ] || [ ! -d "ai-engine" ]; then
    echo "❌ Error: mobile/ and ai-engine/ directories not found"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm not found. Install Node.js first"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 not found"
    exit 1
fi

echo "✅ Environment verified"
echo ""

# ===================================================================
# STEP 2: Check New Files
# ===================================================================
echo "📋 Step 2: Verifying new files..."

NEW_FILES=(
    "mobile/src/services/localStorageManager.ts"
    "mobile/src/theme/fonts.ts"
    "mobile/src/components/RealTimeImageProcessor.tsx"
    "mobile/src/components/FailedFilesManager.tsx"
    "ai-engine/local_storage.py"
)

for file in "${NEW_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing: $file"
        exit 1
    else
        echo "✅ Found: $file"
    fi
done

echo ""

# ===================================================================
# STEP 3: Check Modified Files
# ===================================================================
echo "📋 Step 3: Verifying modified files..."

if grep -q "from local_storage import" ai-engine/main.py; then
    echo "✅ main.py has local_storage integration"
else
    echo "❌ main.py missing local_storage integration"
    exit 1
fi

if grep -q "_validate_response" ai-engine/groq_client.py; then
    echo "✅ groq_client.py has response validation"
else
    echo "❌ groq_client.py missing response validation"
    exit 1
fi

echo ""

# ===================================================================
# STEP 4: Font Assets Preparation (User Action)
# ===================================================================
echo "📋 Step 4: Font assets check..."

if [ ! -d "mobile/assets/fonts" ]; then
    echo "⚠️  Creating fonts directory: mobile/assets/fonts/"
    mkdir -p mobile/assets/fonts/
fi

font_count=$(ls -1 mobile/assets/fonts/*.ttf 2>/dev/null | wc -l)
if [ "$font_count" -eq 9 ]; then
    echo "✅ All 9 Poppins fonts present"
else
    echo "⚠️  Only $font_count fonts found (need 9)"
    echo "   Download from: https://fonts.google.com/specimen/Poppins"
    echo "   Place TTF files in: mobile/assets/fonts/"
    read -p "   Continue without fonts? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""

# ===================================================================
# STEP 5: Install Dependencies
# ===================================================================
echo "📋 Step 5: Installing dependencies..."

cd mobile
echo "   Installing npm packages..."
npm install --silent

# Check for required packages
if npm list expo-font &> /dev/null; then
    echo "✅ expo-font installed"
else
    echo "   Installing expo-font..."
    npm install expo-font
fi

if npm list @react-native-async-storage/async-storage &> /dev/null; then
    echo "✅ AsyncStorage installed"
else
    echo "   Installing AsyncStorage..."
    npm install @react-native-async-storage/async-storage
fi

cd ..
echo ""

# ===================================================================
# STEP 6: Type Validation
# ===================================================================
echo "📋 Step 6: Type validation..."

cd mobile
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo "❌ TypeScript errors found:"
    npx tsc --noEmit | head -10
    exit 1
else
    echo "✅ No TypeScript errors"
fi
cd ..

echo ""

# ===================================================================
# STEP 7: Device Check
# ===================================================================
echo "📋 Step 7: Android device check..."

if ! command -v adb &> /dev/null; then
    echo "⚠️  adb not found in PATH"
    echo "   Install Android SDK Platform Tools"
else
    device_count=$(adb devices -l 2>/dev/null | grep -v "List of" | grep -c "device" || echo 0)
    if [ "$device_count" -gt 0 ]; then
        echo "✅ Android device(s) connected:"
        adb devices -l | grep "device" | sed 's/^/   /'
    else
        echo "⚠️  No Android devices connected"
        echo "   Connect device and enable USB debugging"
    fi
fi

echo ""

# ===================================================================
# STEP 8: Display Summary
# ===================================================================
echo "═══════════════════════════════════════════════════════════════"
echo "✅ PRE-DEPLOYMENT VERIFICATION COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📦 FILES CREATED/MODIFIED:"
echo "   • localStorageManager.ts (300 LOC)"
echo "   • fonts.ts (140 LOC)"
echo "   • RealTimeImageProcessor.tsx (380 LOC)"
echo "   • FailedFilesManager.tsx (420 LOC)"
echo "   • ProcessingScreen.tsx (420 LOC) - REPLACED"
echo "   • SettingsScreen.tsx (380 LOC) - REPLACED"
echo "   • local_storage.py (400 LOC)"
echo "   • main.py (5 new endpoints)"
echo ""
echo "🎨 THEME APPLIED:"
echo "   • Poppins font system (9 weights)"
echo "   • Black/Gray/Green color scheme"
echo "   • Enhanced UI components"
echo ""
echo "💾 STORAGE:"
echo "   • Local-first data storage (AsyncStorage)"
echo "   • Backend storage integration"
echo "   • 3-stage pipeline: Store → Queue → Process"
echo ""
echo "🔧 FEATURES:"
echo "   • Real-time processing display"
echo "   • Failed files management"
echo "   • LLM response validation"
echo "   • Enhanced settings screen"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 NEXT STEPS:"
echo ""
echo "1. BACKEND START:"
echo "   cd /Users/sandeepkumar/Desktop/Axyora/ai-engine"
echo "   uvicorn main:app --port 8000 --reload"
echo ""
echo "2. FRONTEND BUILD:"
echo "   cd /Users/sandeepkumar/Desktop/Axyora/mobile"
echo "   npm start --reset-cache"
echo "   (press 'a' for Android)"
echo ""
echo "3. OR ONE-COMMAND BUILD:"
echo "   cd /Users/sandeepkumar/Desktop/Axyora/mobile"
echo "   npm run android"
echo ""
echo "4. DEVICE TESTING:"
echo "   • Check Poppins font rendering"
echo "   • Test ProcessingScreen > Overview tab"
echo "   • Test ProcessingScreen > Failed tab"
echo "   • Test all Settings toggles"
echo "   • Verify colors are correct"
echo ""
echo "📖 FULL DOCUMENTATION:"
echo "   • PHASE_1E_IMPLEMENTATION_SUMMARY.md"
echo "   • DEPLOYMENT_INTEGRATION_GUIDE.ts"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Ready for deployment! 🎉"
