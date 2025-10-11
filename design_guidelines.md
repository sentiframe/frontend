# Design Guidelines: Speech Emotion Analysis Dashboard

## Design Approach

**Selected Approach:** Hybrid Reference-Based + Design System
- **Primary Reference:** Chess.com's game analysis interface (clean data visualization, timeline scrubbing, critical moment highlighting)
- **Secondary References:** Linear (typography, minimalist cards), Stripe (color restraint, data clarity)
- **Design System:** Material Design principles for data visualization and interactive components

**Justification:** This is a utility-focused, data-dense dashboard requiring clarity and efficiency. The chess.com reference provides proven patterns for timeline-based analysis with critical moments, perfectly suited for emotion analysis review.

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary):**
- Background: 220 15% 8% (deep slate)
- Surface: 220 12% 12% (card backgrounds)
- Border: 220 10% 18% (subtle dividers)
- Text Primary: 220 5% 95%
- Text Secondary: 220 5% 65%

**Emotion-Specific Colors (Vibrant, Distinct):**
- Angry: 0 85% 60% (bold red)
- Disgust: 120 45% 45% (muted green)
- Fear: 270 70% 55% (deep purple)
- Happy: 45 95% 55% (bright yellow-orange)
- Sad: 210 65% 50% (cool blue)
- Surprise: 330 75% 60% (magenta-pink)
- Neutral: 220 10% 60% (gray)

**Accent Colors:**
- Primary Action: 250 80% 60% (indigo)
- Success: 160 75% 45% (emerald)
- Warning: 35 90% 55% (amber)

**Light Mode (Secondary):**
- Background: 220 20% 97%
- Surface: 0 0% 100%
- Border: 220 15% 88%
- Text Primary: 220 10% 10%
- Text Secondary: 220 8% 45%

### B. Typography

**Font Families:**
- Primary: 'Inter' (sans-serif) - for UI, labels, data
- Mono: 'JetBrains Mono' - for time stamps, numerical values

**Type Scale:**
- Headline: 24px/32px, weight 700 (dashboard title)
- Title: 18px/24px, weight 600 (card headers)
- Body: 14px/20px, weight 400 (general text)
- Caption: 12px/16px, weight 500 (labels, timestamps)
- Mono Data: 13px/18px, weight 500 (emotion values, time codes)

### C. Layout System

**Spacing Units:** Tailwind scale of 2, 4, 6, 8, 12, 16, 20, 24
- Micro spacing: p-2, gap-2 (tight elements)
- Standard: p-4, gap-4 (general spacing)
- Section: p-6, py-8 (card padding, section spacing)
- Major: py-12, py-16 (page sections)

**Grid System:**
- Dashboard: 12-column responsive grid
- Charts: Full-width containers with max-w-7xl
- Cards: Consistent rounded-2xl with shadow-sm

### D. Component Library

**Real-Time Recording Interface:**
- Live indicator: Pulsing red dot with "RECORDING" label
- Current timestamp: Large, prominent mono font display
- Emotion bars: Vertical stacked bars showing all 7 emotions simultaneously with smooth transitions
- Transcript panel: Auto-scrolling text area with word-level timestamps

**Multi-Line Emotion Chart:**
- Full-width responsive chart (h-96 on desktop, h-64 on mobile)
- All 7 emotion lines visible simultaneously, each with distinct color from palette
- Line thickness: 2px for primary selected emotions, 1.5px for others
- Interactive legend: Click to toggle emotion visibility
- Tooltip: Shows all emotion values at hovered timestamp
- Time scrubber: Draggable indicator synchronized across all visualizations

**Critical Moments Cards:**
- Grid layout: 3 columns on xl, 2 on md, 1 on mobile
- Each card: 
  - Timestamp badge (top-left, mono font)
  - Emotion transition arrow (From → To, large and clear)
  - Severity indicator: Horizontal bar showing jump magnitude
  - Click-to-seek: Card becomes active state when selected
  - Hover: Subtle elevation increase (shadow-md → shadow-lg)
  - Active: Gradient border (indigo-to-violet), bg-muted

**Emotion Selector:**
- Horizontal pill buttons with emotion-specific background colors at 20% opacity
- Selected state: Full opacity + white text
- Unselected: Muted with emotion color border

**Timeline Scrubber:**
- Full-width slider with custom styled thumb
- Progress track shows gradient representing dominant emotion zones
- Markers for critical moments (small diamonds on track)
- Time labels every 30 seconds

**Post-Session Report:**
- Hero summary card: Gradient background (indigo to violet) with AI-generated overview
- Statistics grid: 2x2 cards showing key metrics (total duration, emotion switches, dominant emotion %, highest intensity)
- Detailed timeline: Expandable sections for each critical moment with context
- Gemini insights: Styled blockquote with suggestions and analysis

**Control Panel:**
- Start/Stop recording: Large primary button with icon
- End session: Secondary destructive button (only shown during recording)
- Export data: Tertiary button with download icon

### E. Animations

**Minimal, Purposeful Motion:**
- Chart updates: 200ms ease-out transitions for line position changes
- Card interactions: 150ms ease-in-out for hover states
- Timeline scrubbing: Immediate update, no delay
- Critical moment highlighting: 300ms pulse animation when auto-navigating
- Live recording pulse: 1.5s infinite pulse on record indicator
- NO decorative animations, NO scroll-triggered effects

## Dashboard-Specific Guidelines

**Data Visualization Principles:**
- Prioritize readability: Adequate contrast, clear labels, consistent scale (0-1 for all emotions)
- Grid lines: Subtle (opacity 15%), horizontal only on main chart
- Zero line: Slightly more prominent to show baseline
- Tooltip precision: Show 2 decimal places for emotion values

**Real-Time Updates:**
- Smooth line extensions without jarring redraws
- Transcript auto-scroll with manual override capability
- Emotion value updates with subtle highlight flash (200ms)

**Responsive Behavior:**
- Desktop (>1280px): Full multi-column layout with side-by-side panels
- Tablet (768-1279px): Stacked sections, maintain chart prominence
- Mobile (<768px): Single column, prioritize chart and current state, collapsible sections

**Accessibility:**
- All interactive elements: min 44px touch targets
- Charts: Keyboard navigable with arrow keys
- Color-blind safe: Emotion differentiation through line patterns (dashed, dotted) as secondary cues
- Dark mode: Minimum 4.5:1 contrast ratio for all text

**Firebase Integration Visual Indicators:**
- Connection status: Subtle badge in header (green dot = connected)
- Data sync: Small spinner only during initial load, then seamless updates
- Error states: Inline alert banners with retry actions

This dashboard emphasizes analytical clarity over decorative elements, ensuring users can focus on emotion patterns and insights with minimal cognitive load.