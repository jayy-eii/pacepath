export type MistakeTag =
  | 'sign_error'
  | 'formula_misuse'
  | 'added_denominators'
  | 'calculation_slip'
  | 'concept_gap'
  | 'other'

export type ConfidenceRating = 'sure' | 'maybe' | 'guess'

export type AttemptType =
  | 'confident_correct'
  | 'maybe_correct'
  | 'lucky_guess'
  | 'misconception'
  | 'honest_gap'

export type Language = 'en' | 'hi'

export interface LocalizedText {
  en: string
  hi: string
}

export interface QuestionOption extends LocalizedText {
  suspectConceptId?: string
}

export type QuestionType = 'mcq' | 'numeric_input' | 'equation_input'

export interface QuestionProcedureParam {
  type: string
  variables: Record<string, number | string>
  template?: string
}

export interface Question {
  id: string
  conceptId: string
  grade: number
  difficulty: 1 | 2 | 3
  type?: QuestionType
  text: LocalizedText
  options?: QuestionOption[]
  correctIndex?: number
  correctAnswer?: number | string
  tolerance?: number
  procedure?: QuestionProcedureParam
  wrongTags?: Record<string, MistakeTag>
  hints: [string, string, string] | string[]
  solution: LocalizedText
}

export interface MisconceptionStep {
  step: number
  text: LocalizedText
}

export interface Misconception {
  id: string
  conceptId: string
  name: LocalizedText
  description: LocalizedText
  kidFriendlyExplanation: LocalizedText
  whyItHappens: LocalizedText
  miniLesson: [MisconceptionStep, MisconceptionStep, MisconceptionStep]
  exampleWrong: LocalizedText
  exampleRight: LocalizedText
  prerequisiteConceptId?: string
}

export interface MisconceptionEvent {
  id: string
  studentId: string
  misconceptionId: string
  questionId: string
  attemptId: string
  source: 'rule' | 'llm' | 'student_confirmed'
  confidence: number
  divergenceStep?: number
  studentConfirmed: boolean | null
  createdAt: number
}

export type MisconceptionStatus = 'new' | 'recurring' | 'improving' | 'resolved'

export interface MisconceptionProfileEntry {
  misconceptionId: string
  count: number
  distinctSessions: number
  lastSeen: number
  trend: 'improving' | 'deteriorating' | 'stable'
  status: MisconceptionStatus
  consecutiveCorrect: number
}

export interface Intervention {
  id: string
  studentId: string
  misconceptionId: string
  conceptId: string
  createdAt: number
  recheckScheduledFor: number
  questions: Question[]
  completedAt?: number | null
  passed?: boolean
}

export interface CandidateMisconception {
  misconceptionId: string
  confidence: number
  evidence: string[]
  matchesAnswer: boolean
  predictedAnswer?: number | string
  divergenceStep?: number
}

export interface DetectionResult {
  status: 'matched' | 'ambiguous' | 'unmatched' | 'calculation_slip' | 'correct'
  candidates: CandidateMisconception[]
  slipDetails?: {
    expectedStep: string
    actualStep: string
    divergenceStep: number
  }
}

export interface Concept {
  id: string
  name: LocalizedText
  grade: number
  prerequisites: string[]
  description?: LocalizedText
}

export interface Student {
  id: string
  name: string
  grade: number
  avatar: string
  classCode?: string
  createdAt: number
}

export interface Session {
  id: string
  studentId: string
  startTime: number
  endTime?: number | null
  activeSeconds: number
}

export interface Attempt {
  id: string
  studentId: string
  sessionId: string
  questionId: string
  conceptId: string
  correct: boolean
  chosenIndex: number
  mistakeTag: MistakeTag | null
  hintsUsed: number
  timeTakenMs: number
  confidence: ConfidenceRating | null
  attemptType?: AttemptType | null
  timestamp: number
  isProbe?: boolean
  userAnswer?: string | null
  assignmentId?: string | null
}

export interface ConceptAccuracy {
  conceptId: string
  conceptName: LocalizedText
  total: number
  correct: number
  accuracyPct: number
}

export interface SessionSummary {
  sessionId: string
  studentId: string
  totalQuestions: number
  correctCount: number
  accuracyPct: number
  totalActiveSeconds: number
  perConcept: ConceptAccuracy[]
  strongestConcept: ConceptAccuracy | null
  needsPracticeConcept: ConceptAccuracy | null
  attempts: Attempt[]
  misconceptionsCount?: number
  masteryBefore?: Record<string, number>
  masteryAfter?: Record<string, number>
}

export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface MasteryResult {
  score: number // 0 to 1
  attemptsCount: number
  confidenceLevel: ConfidenceLevel
}

export type ConceptMasteryMap = Record<string, MasteryResult>

export type SelectionStrategy = 'diagnostic' | 'lowest_mastery' | 'not_recent' | 'challenge'

export interface SelectionResult {
  question: Question
  conceptId: string
  targetDifficulty: 1 | 2 | 3
  selectionStrategy: SelectionStrategy
  reason: LocalizedText
  detailExplanation: LocalizedText
}

export type GapNodeStatus = 'solid' | 'weak' | 'unknown'

export interface TracePathNode {
  conceptId: string
  status: GapNodeStatus
  mastery: number | null
  attemptsCount: number
}

export interface TraceResult {
  startConceptId: string
  path: TracePathNode[]
  rootCauseId: string | null
  probesNeeded: string[]
  confidence: 'low' | 'medium' | 'high'
  triggerReason: 'misconception' | 'consecutive_wrong' | 'low_mastery'
  explanation: LocalizedText
}

export interface GapReport {
  id: string
  studentId: string
  startConceptId: string
  rootCauseId: string | null
  path: TracePathNode[]
  confidence: 'low' | 'medium' | 'high'
  triggerReason: 'misconception' | 'consecutive_wrong' | 'low_mastery'
  createdAt: number
  resolvedAt?: number | null
}

export interface CustomQuestion {
  id: string
  conceptId: string
  grade: number
  text: LocalizedText
  options: Array<{ en: string; hi: string; mistakeTag?: MistakeTag }>
  correctIndex: number
  explanation?: LocalizedText
}

export interface Assignment {
  id: string
  classCode: string
  title: string
  description?: string
  questionIds: string[]
  customQuestions: CustomQuestion[]
  timeLimitMinutes?: number | null
  dueDate?: number | null
  isClosed: boolean
  closedAt?: number | null
  showAnswersAfter: 'submit' | 'due' | 'never'
  createdAt: number
}

export interface AssignmentSubmission {
  id: string
  assignmentId: string
  studentId: string
  studentName?: string
  studentAvatar?: string
  classCode: string
  answers: Record<string, any>
  score: number // percentage 0 - 100
  totalQuestions: number
  isLate: boolean
  submittedAt: number
}

export interface StudentAssignmentOverview {
  assignment: Assignment
  submission?: AssignmentSubmission | null
}

export type DoubtStatus = 'open' | 'answered' | 'resolved'

export interface DoubtMessage {
  id: string
  doubtId: string
  senderType: 'student' | 'teacher'
  senderId: string
  senderName: string
  content: string
  flagged: boolean
  flagReason?: string | null
  createdAt: number
  isOfflineQueued?: boolean
}

export interface Doubt {
  id: string
  classCode: string
  studentId: string
  studentName?: string
  studentAvatar?: string
  questionId?: string | null
  questionTitle?: string | null
  studentAnswer?: string | null
  misconceptionTag?: string | null
  status: DoubtStatus
  createdAt: number
  updatedAt: number
  lastMessageAt: number
  messages: DoubtMessage[]
  isOfflineQueued?: boolean
}

export interface Announcement {
  id: string
  classCode: string
  title: string
  content: string
  createdAt: number
}
