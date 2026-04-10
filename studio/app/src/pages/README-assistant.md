# AI Platform Assistant - UI Mockup

## Status: In Development (UI Preview)

This is a UI mockup for the KB Labs AI Platform Assistant feature.

## Current Implementation

**What works:**
- ✅ Chat UI with message bubbles
- ✅ User/Assistant message display
- ✅ Sources display (file references with line numbers)
- ✅ Quick action tags
- ✅ Mock conversation for UX testing
- ✅ Loading states
- ✅ "In Development" alert banner

**What doesn't work yet:**
- ❌ Backend integration
- ❌ Real Mind RAG queries
- ❌ LLM streaming
- ❌ Actual assistant responses

## File Location

`/Users/kirillbaranov/Desktop/kb-labs/kb-labs-studio/apps/studio/src/pages/assistant-page.tsx`

## Access

Navigate to: `http://localhost:3000/assistant`

## UI Components

### Message Bubble
- User messages: Right-aligned, blue background
- Assistant messages: Left-aligned, gray background with robot avatar
- Timestamps for each message

### Sources Display
- File path with line numbers
- Code snippet preview
- Collapsible card format

### Quick Actions
- Pre-defined question tags
- Click to populate input
- Examples: "Create workflow", "Mind RAG", "DevKit usage"

## Mock Data

Current mock conversation demonstrates:
- User asking "How do I create a new plugin?"
- Assistant providing step-by-step instructions with code examples
- Source references to actual files (kb-labs-plugin/README.md, types.ts)

## Next Steps (Backend Integration)

When ready to implement backend:

1. **Create Assistant Service** (`kb-labs-rest-api/src/services/assistant-service.ts`)
   - Use `useLLM()` for streaming
   - Use Mind Orchestrator for search
   - Implement SSE streaming

2. **Create REST Endpoint** (`kb-labs-rest-api/src/routes/assistant.ts`)
   - POST `/api/v1/assistant/query`
   - Server-Sent Events for streaming

3. **Update Frontend**
   - Replace mock `handleSend()` with real API call
   - Implement SSE client for streaming chunks
   - Handle loading/error states

## Design Notes

- **Clean, minimal UI** - Focus on readability
- **Sources are prominent** - Users can verify information
- **Quick actions reduce friction** - Common questions one-click away
- **Loading states** - Pulse animation shows thinking state
- **Responsive layout** - Works on different screen sizes

## Future Enhancements

- [ ] Markdown rendering in messages
- [ ] Code syntax highlighting
- [ ] Copy code button
- [ ] Clear chat history
- [ ] Export conversation
- [ ] Keyboard shortcuts (Cmd+K to focus input)
- [ ] Suggested follow-up questions
- [ ] Conversation history/sessions
