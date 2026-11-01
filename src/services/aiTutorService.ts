/**
 * aiTutorService.ts
 * Client service for the PacePath AI Study Tutor.
 * Interacts with the Supabase Edge Function `ai-tutor` and DB RPCs.
 * Safe for offline use with client rate check, timeout, and mock fallback.
 */

export interface AiChatMessage {
  id: string
  classCode: string
  studentId: string
  senderRole: 'student' | 'assistant'
  content: string
  hasImage: boolean
  flagged: boolean
  createdAt: number
  conceptId?: string | null
}

export interface SendAiMessageParams {
  classCode: string
  studentId: string
  message: string
  language?: 'en' | 'hi'
  image?: string // Base64 JPEG data URL or raw base64
  context?: {
    question_text?: string
    student_answer?: string
    concept_id?: string
  }
  history?: Array<{
    role: 'student' | 'assistant'
    content: string
  }>
}

export interface SendAiMessageResult {
  reply: string
  flagged: boolean
  error?: string
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

// Local in-memory session messages for offline / optimistic UI
const localChatHistory: AiChatMessage[] = []

export function getLocalChatHistory(studentId: string): AiChatMessage[] {
  return localChatHistory.filter((m) => m.studentId === studentId)
}

export function addLocalChatMessage(msg: AiChatMessage): void {
  localChatHistory.push(msg)
}

export function clearLocalChatHistory(studentId?: string): void {
  if (studentId) {
    for (let i = localChatHistory.length - 1; i >= 0; i--) {
      if (localChatHistory[i].studentId === studentId) {
        localChatHistory.splice(i, 1)
      }
    }
  } else {
    localChatHistory.length = 0
  }
}

// Safety heuristics for immediate client protection
const SELF_HARM_REGEX = /\b(suicide|kill\s*myself|end\s*my\s*life|die|hurt\s*myself|cutting\s*myself|hang\s*myself|आत्महत्या|जान\s*देना)\b/i
const PERSONAL_INFO_REGEX = /\b(\d{10}|\d{3}[-\s]\d{3}[-\s]\d{4}|password|passcode|aadhaar|pin\s*code|credit\s*card)\b/i

/**
 * Sends a student question or photo to the AI study tutor.
 */
export async function sendAiTutorMessage(params: SendAiMessageParams): Promise<SendAiMessageResult> {
  // 1. Safety filter heuristic (checked immediately)
  if (SELF_HARM_REGEX.test(params.message)) {
    return {
      reply: params.language === 'hi'
        ? 'हम आपकी सुरक्षा और भलाई की परवाह करते हैं। कृपया अपने शिक्षक, माता-पिता या किसी विश्वसनीय वयस्क से तुरंत बात करें।'
        : 'I care deeply about your safety and well-being. Please reach out to your teacher, parents, or a trusted adult who can support you.',
      flagged: true,
    }
  }

  if (PERSONAL_INFO_REGEX.test(params.message)) {
    return {
      reply: params.language === 'hi'
        ? 'सुरक्षा के लिए, कृपया अपना फोन नंबर, पासवर्ड या व्यक्तिगत जानकारी साझा न करें। आइए केवल गणित और पढ़ाई पर ध्यान दें!'
        : 'For your privacy and safety, please do not share phone numbers, passwords, or personal details. Let us focus strictly on school maths!',
      flagged: true,
    }
  }

  // 2. Offline check
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      reply: params.language === 'hi'
        ? 'एआई ट्यूटर को इंटरनेट कनेक्शन की आवश्यकता है। कृपया नेटवर्क से जुड़ें।'
        : 'The AI Study Tutor requires an active internet connection. Please check your network and try again.',
      flagged: false,
      error: 'offline',
    }
  }

  // If Supabase is unconfigured / in test sandbox:
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    let mockReply = params.language === 'hi'
      ? `नमस्ते! यह अभ्यास प्रश्न के लिए एक संकेत है: पहले समीकरण के दोनों पक्षों को सरल करें।\nEQUATION: 2(x+3)=14`
      : `Hello! Here is a hint: First expand the bracket by multiplying each term inside. What is 2 multiplied by 3?\nEQUATION: 2(x+3)=14`

    if (params.context?.question_text) {
      mockReply = `Let's work on "${params.context.question_text}". What step have you tried first?\nEQUATION: 2(x+3)=14`
    }

    return {
      reply: mockReply,
      flagged: false,
    }
  }

  // Call Supabase Edge Function
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        class_code: params.classCode,
        student_id: params.studentId,
        message: params.message,
        language: params.language || 'en',
        image: params.image,
        context: params.context,
        history: params.history || [],
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      if (res.status === 429) {
        return {
          reply: errJson.reply || 'Rate limit reached. Please wait a bit before sending another question.',
          flagged: false,
          error: 'rate_limited',
        }
      }
      return {
        reply: errJson.error || 'The tutor is momentarily resting. Please try again shortly.',
        flagged: false,
        error: 'server_error',
      }
    }

    const data = await res.json()
    return {
      reply: data.reply || '',
      flagged: Boolean(data.flagged),
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      return {
        reply: 'The request took too long to complete. Please try asking again.',
        flagged: false,
        error: 'timeout',
      }
    }
    return {
      reply: 'Unable to reach the AI Tutor right now. Please check your internet connection.',
      flagged: false,
      error: 'network_error',
    }
  }
}

/**
 * Fetches previous AI chat messages for the student.
 */
export async function fetchStudentAiMessages(classCode: string, studentId: string): Promise<AiChatMessage[]> {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_ai_messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: classCode.trim().toUpperCase(),
          p_student_id: studentId,
        }),
      })
      if (res.ok) {
        const rows = await res.json()
        return (rows || []).map((r: any) => ({
          id: r.id,
          classCode: r.class_code,
          studentId: r.student_id,
          senderRole: r.sender_role,
          content: r.content,
          hasImage: Boolean(r.has_image),
          flagged: Boolean(r.flagged),
          createdAt: Number(r.created_at || Date.now()),
          conceptId: r.concept_id || null,
        }))
      }
    } catch {
      // fallback
    }
  }

  // Return local in-memory history
  return getLocalChatHistory(studentId)
}
