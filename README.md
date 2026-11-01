# PacePath — Adaptive Maths Companion

A scroll-driven, kid-friendly Maths learning web application designed for students aged 11 to 16 (NCERT Class 6 to 9) in India.

---

## Vertical Slice 1: Solve Mode with Real Attempt Saving

Solve Mode provides a focused, distraction-free practice environment where real questions are served, real student attempts are saved into IndexedDB with millisecond timing, and real summaries are computed at session completion without fake or hardcoded numbers.

### Data Schemas

#### Student
```typescript
interface Student {
  id: string          // UUID
  name: string        // Student's real name (e.g., "Aarav")
  grade: number       // Class 6 to 10
  avatar: string      // Avatar emoji (e.g., "🦁", "🚀")
  classCode?: string  // Optional class code (e.g., "MATH101")
  createdAt: number   // Timestamp (epoch ms)
}
```

#### Session
```typescript
interface Session {
  id: string          // UUID
  studentId: string   // Reference to Student
  startTime: number   // Timestamp (epoch ms)
  endTime?: number | null // Timestamp when finished, or null if in progress
  activeSeconds: number   // Focused interaction time in seconds
}
```

#### Attempt
```typescript
interface Attempt {
  id: string               // UUID
  studentId: string        // Reference to Student
  sessionId: string        // Reference to Session
  questionId: string       // Reference to Question ID (e.g., "q01")
  conceptId: string        // Concept ID (e.g., "fractions-add")
  correct: boolean         // Whether chosen option was correct
  chosenIndex: number      // 0 to 3
  mistakeTag: MistakeTag | null // Null if correct; otherwise: sign_error | formula_misuse | added_denominators | calculation_slip | concept_gap | other
  hintsUsed: number        // 0 to 3 (levels unlocked)
  timeTakenMs: number      // Time taken from question display to answer click
  confidence: "sure" | "maybe" | "guess" | null // Confidence rating chosen before answer
  attemptType?: "confident_correct" | "maybe_correct" | "lucky_guess" | "misconception" | "honest_gap" | null
  timestamp: number        // Epoch ms when attempt was submitted
}
```

---

## Vertical Slice 2: Adaptive Mastery Engine & Confidence Check

### 1. Confidence Check & Classification
Before a student selects an option, they choose their confidence rating in one tap:
- `😎 Sure` (High confidence)
- `🤔 Maybe` (Moderate confidence)
- `😕 Guess` (Low confidence)

After the answer is selected, the attempt is classified:
- **`confident_correct`** (`sure` + correct): Full mastery credit.
- **`lucky_guess`** (`guess` + correct): Weak mastery credit ($P(G) = 0.80$).
- **`misconception`** (`sure` + wrong): Critical diagnostic signal. Lowers mastery significantly more than an honest gap ($P(S) = 0.03$). Encouraging message: *"You were sure, but this one is tricky. Let's look at why."*
- **`honest_gap`** (`guess`/`maybe` + wrong): Standard gap ($P(S) = 0.10$).

### 2. Bayesian Knowledge Tracing (BKT) Engine (`src/engine/mastery.ts`)
Parameters:
- $P(L_0) = 0.30$ (Initial knowledge prior)
- $P(T) = 0.15$ (Learning transition rate)
- $P(S) = 0.10$ (Slip probability)
- $P(G) = 0.25$ (Guess probability)

Updates:
1. **Bayes Rule**:
   - $P(L_t \mid \text{correct}) = \frac{P(L_t)(1 - S)}{P(L_t)(1 - S) + (1 - P(L_t))G}$
   - $P(L_t \mid \text{wrong}) = \frac{P(L_t)S}{P(L_t)S + (1 - P(L_t))(1 - G)}$
2. **Transition**:
   $P(L_{t+1}) = P(L_t \mid obs) + (1 - P(L_t \mid obs)) \cdot T$

Signals incorporated:
- **Hints**: Each hint used inflates effective $P(G)$ ($0.25 \to 0.50 \to 0.70 \to 0.85$), reducing knowledge credit.
- **Misconception**: $S = 0.03$, lowering posterior substantially more than a casual slip.
- **Lucky Guess**: $G = 0.80$, yielding only marginal posterior increase.
- **Recency**: Learning transition slightly scales with observation recency ($0.85$ to $1.15$).

### 3. Adaptive Question Selection (`src/engine/selector.ts`)
- **Cold Start (< 8 lifetime attempts)**: Serves a diagnostic round (one medium question per concept first).
- **Post-Diagnostic (>= 8 attempts)**:
  - **60%**: Targets the concept with the lowest mastery score.
  - **20%**: Spaced repetition (concept not practiced recently).
  - **20%**: Challenge question (concept with high mastery $> 0.70$).
- **Difficulty Mapping**:
  - Mastery $< 0.40 \to$ Difficulty 1
  - Mastery $0.40$ to $0.70 \to$ Difficulty 2
  - Mastery $> 0.70 \to$ Difficulty 3
- **Fast-Track Streak Adjustments**:
  - 3 clean correct answers in a row (0 hints) $\to +1$ difficulty level.
  - 2 consecutive incorrect answers $\to -1$ difficulty level.
- **Why this question? Chip**: Under each question, an honest chip explains the real reason (e.g. lowest mastery, spaced refresh, or push challenge).

---

### 4. How Attempts are Stored

All data is stored locally in the browser's **IndexedDB** using **Dexie.js** (`PacePathDB`).
- **Offline & Instant**: Writes are persistent across browser reloads.
- **Mid-Session Resume**: In-progress sessions persist the question trajectory. If reloaded, students resume right where they left off.
- **Active Time Tracking**: Active seconds count only while the tab is visible and the student interacted within the last 60 seconds.

---

### 5. Developer Tools & Console Verification

#### In-App Dev Inspector Modal
Click **`🛠️ DB`** in the top navigation bar:
- **🧠 Mastery & Selector Engine Tab**:
  - Live BKT mastery score per concept ($0.000$ to $1.000$, percentage, attempt count, confidence level `low`/`medium`/`high`).
  - Real-time display of the selector's last decision, target difficulty, strategy, and reason.
  - Distribution breakdown of attempt classifications (confident correct, lucky guesses, misconceptions, honest gaps).
- **Attempts Tab**: Raw records with confidence ratings, classification badges, and millisecond timers.
- **Sessions Tab**: Real session durations and active time.
- **Students Tab**: Active profiles.

#### Console Helper (`window.__pacepath`)
In browser DevTools (`F12`):
- `window.__pacepath.dumpDatabase()` — Prints formatted tables of students, sessions, and attempts.
- `window.__pacepath.getMastery()` — Prints live BKT mastery scores per concept.
- `window.__pacepath.getLastDecision()` — Displays the selector's latest adaptive choice and reason.
- `window.__pacepath.clearDatabase()` — Wipes all stored records and resets local storage.

---

### 6. Automated Verification Suites

```bash
# Run mathematical question bank validation (104 questions, 22 concepts, valid DAG)
npm run validate

# Run Vitest test suite for BKT Engine, Selector, Sync, and RPCs (121 unit tests)
npm test

# Build production bundle
npm run build
```

---

### 7. Security, Offline Trade-offs & Moderation Notes (Hackathon Scope)

1. **Student Authentication & 4-Digit PINs**:
   - Students join with a class code, their name, and a 4-digit PIN.
   - Server-side rate limiting locks out any student IP/identity after 10 failed login attempts within 1 hour (`student_login_attempts` table).
   - *Note*: A 4-digit PIN is designed for simple, fast classroom access at hackathon scale, rather than enterprise single sign-on.
2. **Offline Test Grading & Custom Question Answer Keys**:
   - To enable completely disconnected test completion in rural or low-connectivity classrooms, question contents and custom teacher question answer keys are bundled to the student app for local scoring and outbox queuing.
   - When the student reconnects, the server re-validates custom question scores idempotently.
3. **Doubts, Q&A & Safety Moderation**:
   - Students can open doubt threads and reply with up to 500 characters.
   - Strict server-side rate-limiting enforces a maximum of 20 messages per hour per student.
   - Community safety: both students and teachers can flag inappropriate messages (`flag_doubt_message`) with an audit reason for review.

