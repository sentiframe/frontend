# Speech Emotion Analysis Dashboard

## Overview

This is a real-time speech emotion analysis dashboard that visualizes emotional states during presentations or speeches. The application analyzes video content to detect and track seven distinct emotions (Angry, Disgust, Fear, Happy, Sad, Surprise, Neutral) over time, providing speakers with detailed feedback through interactive charts, critical moment detection, and AI-generated improvement suggestions.

The dashboard draws design inspiration from Chess.com's game analysis interface, featuring timeline-based visualization with scrubbing capabilities, critical moment highlighting, and data-dense but clean presentation of emotional patterns throughout a session.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, built using Vite as the build tool and development server.

**UI Component System**: Radix UI primitives with shadcn/ui styling conventions, following a "new-york" style variant. The design system emphasizes:
- Dark mode as primary with light mode support
- Emotion-specific color coding for clear visual distinction
- Chess.com-inspired timeline interface for temporal analysis
- Material Design principles for data visualization components

**State Management**: React hooks for local state, TanStack Query (React Query) for server state management and data fetching.

**Routing**: Wouter for lightweight client-side routing.

**Styling**: Tailwind CSS with custom design tokens defined in CSS variables, supporting both light and dark themes. Custom utility classes like `hover-elevate` and `active-elevate-2` provide consistent interactive feedback.

**Data Visualization**: Recharts library for line charts, timelines, and emotion tracking visualizations.

**Key UI Components**:
- EmotionChart: Main timeline visualization showing emotion intensity over time
- TimelineScrubber: Interactive timeline control for navigating through session data
- CriticalMoments: Highlights significant emotional transitions
- EmotionEvaluationBar: Real-time dominant emotion display
- TranscriptPanel: Speech transcript synchronized with emotion data
- SessionReport: AI-generated summary and improvement suggestions

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript.

**API Design**: RESTful endpoints for:
- Frame data retrieval from Firebase (`/api/frames/:videoId/:frameNumber`)
- Bulk frame data fetching (`/api/frames/:videoId/all`)
- AI report generation (`/api/report/generate`)

**Session Management**: In-memory storage implementation with interface for potential database backing.

**Development Tools**:
- Hot module replacement via Vite in development
- Custom logging middleware for API request tracking
- Runtime error overlays for improved debugging

### Data Storage Solutions

**Primary Data Source**: Firebase Firestore for storing video frame analysis data. Each video has a collection of frames containing:
- Detection data with emotion scores (anger, disgust, fear, happiness, neutral, sadness, surprise)
- Face tracking information
- Action units and pose data

**Schema Structure**:
```
videos/{videoId}/frames/frame_{frameNumber}
  - detections[]
    - emotion_scores{}
    - face_id
    - action_units
    - pose
```

**User Data**: PostgreSQL database (via Drizzle ORM) for user authentication and session storage. Uses Neon Database serverless PostgreSQL. Schema includes:
- Users table with username/password authentication
- UUID-based primary keys
- Session storage via connect-pg-simple

**Database ORM**: Drizzle ORM with Drizzle-Zod for type-safe schema validation.

### Authentication & Authorization

Basic username/password authentication system with in-memory user storage (extendable to PostgreSQL via existing schema). Session management handled through Express sessions with PostgreSQL session store support.

## External Dependencies

### Third-Party Services

**Google Gemini AI**: Used for generating emotion analysis reports and actionable suggestions. The integration:
- Accepts emotion frame data as input
- Analyzes emotional patterns and transitions
- Generates natural language summaries and improvement recommendations
- Returns structured JSON responses with summary text and suggestion arrays

**Firebase**: 
- Firestore for storing and retrieving video frame analysis data
- Client-side Firebase SDK (@firebase/app, @firebase/firestore)
- Server-side Firebase Admin SDK for secure backend access

**Neon Database**: Serverless PostgreSQL provider for user data and session storage, accessed via `@neondatabase/serverless` driver.

### Key NPM Dependencies

**UI & Styling**:
- @radix-ui/* (comprehensive set of accessible UI primitives)
- tailwindcss with autoprefixer
- class-variance-authority for component variants
- lucide-react for icons

**Data & State Management**:
- @tanstack/react-query for server state
- drizzle-orm with drizzle-zod for database operations
- react-hook-form with @hookform/resolvers for form handling

**Visualization**:
- recharts for charts and graphs
- embla-carousel-react for carousel components

**Development**:
- vite with @vitejs/plugin-react
- tsx for TypeScript execution
- esbuild for production builds

### API Integrations

**Firebase Firestore API**: Retrieves pre-processed video emotion analysis data organized by video ID and frame number.

**Google Gemini API**: Processes aggregate emotion data to generate insights. Requires `GEMINI_API_KEY` environment variable.

### Environment Variables Required

- `DATABASE_URL`: PostgreSQL connection string for Neon Database
- `GEMINI_API_KEY`: Google Gemini API key for AI report generation
- `VITE_FIREBASE_API_KEY`: Firebase project API key
- `VITE_FIREBASE_PROJECT_ID`: Firebase project identifier
- `VITE_FIREBASE_APP_ID`: Firebase application ID