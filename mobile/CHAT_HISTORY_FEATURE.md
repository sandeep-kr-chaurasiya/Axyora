# Chat History Feature

The chat history feature allows users to maintain multiple separate conversations and switch between them seamlessly.

## Components

### ChatHistoryScreen (`src/screens/ChatHistoryScreen.tsx`)

A full-screen modal component that displays all chat conversations. Features include:

- **Chat List**: Displays all conversations sorted by most recent first
- **Chat Metadata**: Shows first message preview, message count, and timestamp
- **Delete History**: Long-press to delete a conversation
- **Quick Actions**:
  - Select a chat to load its conversation
  - New Chat button to start a fresh conversation

**Props:**
- `onSelectChat(chatId: string)`: Called when user selects a chat
- `onNewChat()`: Called when user creates a new chat
- `onClose()`: Called to close the modal

### Updated ChatScreen (`src/screens/ChatScreen.tsx`)

The main chat interface now includes:

- **History Button** (⏱): Opens the chat history modal (new)
- **Settings Button** (☰): Opens settings (existing)
- Integration with multi-chat support

**New Features:**
- Header now has two action buttons instead of one
- Supports multiple simultaneous conversations

### Updated useChat Hook (`src/hooks/useChat.ts`)

The chat hook now manages multiple chat sessions:

**New Properties:**
- `currentChatId`: The active chat's ID
- `loadChat(chatId)`: Load a specific chat by ID
- `startNewChat()`: Create and switch to a new chat

**Storage Changes:**
- Messages now include a `chatId` field
- Current chat ID is persisted in `@axyora/current-chat-id`
- All messages are stored in `@axyora/chat-history` with chat ID grouping

## User Flow

1. User is always in a chat session (identified by `chatId`)
2. Tapping the history button (⏱) opens ChatHistoryScreen
3. User can:
   - Select an existing chat to continue the conversation
   - Create a new chat to start fresh
   - Delete chats by long-pressing
4. When returning to chat, the selected/new chat is active

## Data Storage

```
AsyncStorage {
  "@axyora/chat-history": [
    { id, role, text, createdAt, sources, images, chatId, ... },
    ...
  ],
  "@axyora/current-chat-id": "chat-1234567890"
}
```

Each message now has a `chatId` allowing the system to organize messages by conversation.

## Styling

All components use the consistent Axyora theme colors:
- Dark background with subtle accent colors
- Green accent for action buttons (#06C864)
- Muted text for secondary information
- Rounded corners and smooth transitions

## Future Enhancements

- Chat renaming by user
- Chat pinning/favoriting
- Export chat conversations
- Share chat links
- Chat search functionality
- Archive older chats
