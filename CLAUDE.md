# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Boorie** is an advanced AI desktop client built with Electron, React, TypeScript, and Prisma. It's a comprehensive productivity application featuring multi-provider AI chat, email/calendar integration, document management with RAG capabilities, and todo functionality.

## Essential Commands

### Development
- `npm run dev` - Start development environment (Vite + Electron)
- `npm run dev:vite` - Frontend only (http://localhost:5173)
- `npm run dev:electron` - Electron only (requires Vite running)

### Build & Distribution
- `npm run build` - Build both frontend and Electron
- `npm run dist` - Create distributable packages (DMG/NSIS/AppImage)

### Code Quality
- `npm run lint` - Run ESLint checks
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run typecheck` - TypeScript type checking

### Database
- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:push` - Push schema changes to SQLite database
- `npm run db:migrate` - Run database migrations

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Zustand + Radix UI
- **Backend**: Electron 28 + TypeScript + Prisma ORM + SQLite
- **IPC**: Secure context-isolated communication via preload script

### Project Structure
```
boorie_cliente/
├── backend/          # Backend business logic (JS/TS mixed)
│   ├── models/       # Data models
│   └── services/     # AI providers, chat, database services
├── electron/         # Electron main process (TypeScript)
│   ├── handlers/     # IPC handlers by domain
│   └── services/     # Auth, security services
├── src/              # React frontend (TypeScript)
│   ├── components/   # UI components by feature
│   ├── services/     # Frontend service layer
│   └── stores/       # Zustand state management
└── prisma/           # Database schema and migrations
```

### Key Architectural Patterns

1. **IPC Communication**: All renderer-main communication goes through secure IPC handlers
   - Handlers organized by domain in `electron/handlers/`
   - Type-safe API exposed via `window.api` in preload script

2. **State Management**: Zustand stores for each feature domain
   - `useAuthStore` - Authentication state
   - `useChatStore` - Chat conversations and messages
   - `useSettingsStore` - Application settings
   - `useTodoStore` - Todo items management

3. **Service Layer**: Both frontend and backend have service layers
   - Frontend services in `src/services/` handle UI-side logic
   - Backend services in `backend/services/` handle business logic
   - Clear separation of concerns between layers

4. **Database**: SQLite with Prisma ORM
   - Schema in `prisma/schema.prisma`
   - Models: User, LLMProvider, Conversation, Message, Todo, Email, CalendarEvent, Document
   - API keys encrypted before storage

5. **AI Integration**: Multi-provider support via unified interface
   - Providers: OpenAI, Anthropic, Google, OpenRouter, Ollama
   - Provider-specific services in `backend/services/aiProviders/`

## Important Implementation Details

1. **Authentication**: OAuth2 support for Google and Microsoft
   - Handled in `electron/services/authService.ts`
   - Tokens stored securely in database

2. **Internationalization**: i18next with three languages
   - English, Spanish (ES), Catalan (CA)
   - Language files in `src/locales/`

3. **Security**: 
   - Context isolation enabled
   - No direct node integration in renderer
   - API keys encrypted in database
   - Secure IPC-only communication

4. **Window Management**: Custom frameless window
   - Custom top bar implementation
   - Window controls handled via IPC

5. **File Handling**:
   - Document upload and RAG functionality
   - Files stored in configurable directory
   - Vector embeddings for semantic search

## Development Guidelines

1. **Type Safety**: Always use TypeScript types
   - Shared types in `src/types/`
   - Avoid `any` types (ESLint will warn)

2. **Component Structure**: 
   - Components organized by feature
   - Use Radix UI primitives for accessibility
   - TailwindCSS for styling

3. **IPC Patterns**:
   - Always use handlers for main process operations
   - Never expose sensitive operations to renderer
   - Type-safe IPC calls via preload API

4. **Database Changes**:
   - Modify `prisma/schema.prisma`
   - Run `npm run db:generate` after schema changes
   - Use migrations for production changes

5. **AI Provider Integration**:
   - Implement provider interface in `backend/services/aiProviders/`
   - Add configuration to settings UI
   - Handle rate limiting and errors gracefully