# DocsBot Ops - Mobile Application Analysis & Roadmap

This document outlines the architecture, features, gaps, and roadmap for the mobile frontend application of DocsBot Ops (located in the [mobile_frontend](file:///c:/Users/pc/OneDrive/Masaüstü/AI_INTEGRATION/tender-knowledge-hub/mobile_frontend) directory).

---

## 📱 Mobile Stack & Setup

The mobile application is built using:
*   **Capacitor 7** (Android/iOS Native Wrapper)
*   **Vite + React 18**
*   **TailwindCSS 4**
*   **Radix UI / Lucide React**
*   **PDF.js** (for in-app PDF rendering)

### Local Development Setup

To run the mobile dashboard on your local dev environment:

```powershell
cd mobile_frontend
npm install
npm run dev
```

To sync changes with the Android native project and open it in Android Studio:

```powershell
# Build and sync changes to Android project
npm run android:sync

# Open the project in Android Studio
npm run android:open
```

---

## 🔍 Core Features & Implementation Details

### 1. Messaging & Collaboration
*   **Direct Messages (DM):** Direct chat channel between employees and administrators.
*   **Document Rooms/Groups:** Group-chat workspaces bound to specific workflows/tenders/years.
*   **Media Support:**
    *   Voice message recording (using native `MediaRecorder` API) and rendering.
    *   File upload and attachment (PDF, DOCX, XLSX, Images).
    *   Inline image previews and interactive PDF canvas rendering using `PDF.js`.
*   **Message Operations:** Support for deleting messages ("Delete for me" and "Delete for everyone") and forwarding messages/documents to other people or rooms.

### 2. Obsidian-Style Knowledge Graph
An interactive SVG-based graph visualization illustrating the connections between company departments, documents, tasks, and users.
*   **Navigation & Interaction:** Pinch-to-zoom, panning, search, category filter, and node detail explorer sheets.

### 3. ERP & Task Tracking
*   Employee task boards with priority/deadline filters, status badges, and task completion approvals.
*   Notification history list with read/unread status sync and notification preference toggling.

---

## ⚠️ Identified Gaps & Recommendations

### 1. Architecture Refactoring
*   **The Monolithic File:** Almost all UI screens, tabs, and logic are currently written inside a single file: `mobile_frontend/src/app/App.tsx` (over 4,600 lines of code).
*   **Action Plan:** Split `App.tsx` into modular components, hooks, and views:
    *   `/src/app/screens/` (LoginScreen, HomeTab, ERPTab, TenderTab, MessagesTab, ProfileTab)
    *   `/src/app/components/` (ActionSheets, BottomNav, KnowledgeGraph)
    *   `/src/app/hooks/` (useVoiceRecording, useWebSocket)
    *   `/src/app/utils/` (formatters, date utils)

### 2. Real-time Messaging
*   **Current State:** Messages are loaded via HTTP polling on tab load/refresh.
*   **Action Plan:** Integrate backend WebSocket/SSE stream to push real-time message updates to the UI, enabling instant chat updates (like WhatsApp/Telegram).

### 3. Real-time Presence & Read Receipts
*   **Current State:** User online status is semi-static; read receipts (`read_at` on messages) are not rendered.
*   **Action Plan:** Connect presence updates to WebSocket connection/disconnection events and display double-ticks (✓✓) when a message is read.

### 4. Knowledge Graph Dynamic Binding
*   **Current State:** Node list (`KG_NODES`) is hardcoded.
*   **Action Plan:** Dynamically fetch the knowledge graph nodes and edges from the backend note vault and document indexing database endpoints.

---

## 🧪 Recommended Test Suite

### 1. Unit Tests
*   `formatDate`, `formatFileSize`, `companySlug` utilities.
*   State machines for voice recording permissions and timers.
*   `Badge`, `Avatar`, and customRadix components.

### 2. Integration & E2E Tests
*   **Auth & Session Restoration:** Validating login, secure storage, and JWT token rotation.
*   **Message Delivery Flow:** Writing a message, sending, rendering in the thread, and updating list overview.
*   **Document Upload & Groups:** Creating a group workspace, uploading a file, verifying layout categorization (year/tender), and downloading content.
