import { useState, useEffect, useRef } from 'react'
import type { Language } from '../../types'
import {
  sendAiTutorMessage,
  fetchStudentAiMessages,
  addLocalChatMessage,
  type AiChatMessage,
} from '../../services/aiTutorService'
import { verifyAiResponse, type VerificationResult } from '../../engine/aiMathVerifier'
import { compressImage } from '../../utils/imageCompressor'

interface AiTutorChatProps {
  classCode: string
  studentId: string
  lang: Language
  attachedContext?: {
    questionId?: string
    questionTitle?: string
    studentAnswer?: string
    conceptId?: string
  }
  onClearAttachedContext?: () => void
  onBack?: () => void
}

interface MessageWithVerification extends AiChatMessage {
  verification?: VerificationResult
}

export function AiTutorChat({
  classCode,
  studentId,
  lang,
  attachedContext,
  onClearAttachedContext,
  onBack,
}: AiTutorChatProps) {
  const [messages, setMessages] = useState<MessageWithVerification[]>([])
  const [inputText, setInputText] = useState('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load message history on mount
  useEffect(() => {
    let isMounted = true

    async function loadHistory() {
      try {
        const history = await fetchStudentAiMessages(classCode, studentId)
        if (isMounted) {
          const augmented = history.map((m) => {
            if (m.senderRole === 'assistant') {
              return { ...m, verification: verifyAiResponse(m.content) }
            }
            return m
          })
          setMessages(augmented)
        }
      } catch {
        // Safe fallback
      }
    }

    loadHistory()
    return () => {
      isMounted = false
    }
  }, [classCode, studentId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Quick prompt chips
  const quickChips = [
    {
      en: '💡 Give me a hint',
      hi: '💡 मुझे एक संकेत दें',
    },
    {
      en: '🔍 Explain this step',
      hi: '🔍 यह चरण समझाएं',
    },
    {
      en: '✍️ Check my answer',
      hi: '✍️ मेरा उत्तर जांचें',
    },
    {
      en: '📐 Another example',
      hi: '📐 एक और उदाहरण दें',
    },
  ]

  // Image upload handler
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorBanner(lang === 'hi' ? 'कृपया केवल छवि (फ़ोटो) फ़ाइल चुनें।' : 'Please select an image file.')
      return
    }

    try {
      setIsCompressing(true)
      setErrorBanner(null)
      const compressed = await compressImage(file)

      setAttachedImage(compressed.base64)
      setImagePreviewUrl(compressed.dataUrl)
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to process image.')
    } finally {
      setIsCompressing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveImage = () => {
    setAttachedImage(null)
    setImagePreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const rawContent = (textToSend ?? inputText).trim()
    if (!rawContent && !attachedImage) return

    if (!isOnline) {
      setErrorBanner(
        lang === 'hi'
          ? 'एआई ट्यूटर को इंटरनेट कनेक्शन की आवश्यकता है। कृपया नेटवर्क से जुड़ें।'
          : 'The AI Study Tutor requires an active internet connection. Please reconnect.',
      )
      return
    }

    setErrorBanner(null)
    const userMsgId = 'temp-' + Date.now()
    const studentMessage: MessageWithVerification = {
      id: userMsgId,
      classCode,
      studentId,
      senderRole: 'student',
      content: rawContent || (attachedImage ? (lang === 'hi' ? '[फ़ोटो संलग्न]' : '[Photo attached]') : ''),
      hasImage: Boolean(attachedImage),
      flagged: false,
      createdAt: Date.now(),
      conceptId: attachedContext?.conceptId || null,
    }

    // Optimistically append student message
    setMessages((prev) => [...prev, studentMessage])
    addLocalChatMessage(studentMessage)

    const sentImage = attachedImage
    setInputText('')
    setAttachedImage(null)
    setImagePreviewUrl(null)
    setIsLoading(true)

    // Build history for context (last 6 messages)
    const recentHistory = messages.slice(-6).map((m) => ({
      role: m.senderRole,
      content: m.content,
    }))

    try {
      const res = await sendAiTutorMessage({
        classCode,
        studentId,
        message: rawContent,
        language: lang,
        image: sentImage || undefined,
        context: attachedContext
          ? {
              question_text: attachedContext.questionTitle,
              student_answer: attachedContext.studentAnswer,
              concept_id: attachedContext.conceptId,
            }
          : undefined,
        history: recentHistory,
      })

      const verification = verifyAiResponse(res.reply)
      const assistantMessage: MessageWithVerification = {
        id: 'reply-' + Date.now(),
        classCode,
        studentId,
        senderRole: 'assistant',
        content: res.reply,
        hasImage: false,
        flagged: res.flagged,
        createdAt: Date.now(),
        conceptId: attachedContext?.conceptId || null,
        verification,
      }

      setMessages((prev) => [...prev, assistantMessage])
      addLocalChatMessage(assistantMessage)
    } catch {
      setErrorBanner(
        lang === 'hi'
          ? 'ट्यूटर से संपर्क करने में असमर्थ। कृपया पुनः प्रयास करें।'
          : 'Could not reach tutor. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="ai-tutor-container">
      {/* Header */}
      <div className="ai-tutor-header">
        <div className="ai-tutor-header-left">
          {onBack && (
            <button type="button" className="btn btn-ghost ai-tutor-back-btn" onClick={onBack}>
              ← {lang === 'hi' ? 'वापस' : 'Back'}
            </button>
          )}
          <div className="ai-tutor-avatar">🤖</div>
          <div className="ai-tutor-title-group">
            <h3 className="ai-tutor-title">
              {lang === 'hi' ? 'पेसपाथ एआई ट्यूटर' : 'PacePath AI Study Tutor'}
            </h3>
            <span className="ai-tutor-subtitle">
              {lang === 'hi' ? 'कक्षा 6–10 गणित सहायक' : 'Classes 6–10 Maths Assistant'}
            </span>
          </div>
        </div>

        <div className="ai-tutor-header-right">
          <span className={`ai-tutor-status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
            <span className="status-dot" />
            {isOnline
              ? lang === 'hi' ? 'ऑनलाइन' : 'Online'
              : lang === 'hi' ? 'ऑफ़लाइन' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="ai-tutor-offline-alert">
          <span>⚠️ {lang === 'hi'
            ? 'एआई ट्यूटर को इंटरनेट कनेक्शन चाहिए। अभ्यास और टेस्ट ऑफ़लाइन काम करते रहेंगे।'
            : 'AI Study Tutor needs an active internet connection. Practice and tests continue to work offline!'}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorBanner && (
        <div className="ai-tutor-error-alert">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)}>✕</button>
        </div>
      )}

      {/* Attached Question Context Pill */}
      {attachedContext?.questionTitle && (
        <div className="ai-tutor-context-banner">
          <div className="context-banner-info">
            <span className="context-tag">📌 {lang === 'hi' ? 'संलग्न प्रश्न' : 'Attached Question'}</span>
            <p className="context-title">{attachedContext.questionTitle}</p>
            {attachedContext.studentAnswer && (
              <p className="context-sub">
                {lang === 'hi' ? 'आपका उत्तर:' : 'Your answer:'} <strong>{attachedContext.studentAnswer}</strong>
              </p>
            )}
          </div>
          {onClearAttachedContext && (
            <button
              type="button"
              className="btn btn-ghost context-clear-btn"
              onClick={onClearAttachedContext}
              title="Remove context"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="ai-tutor-messages-body">
        {messages.length === 0 && (
          <div className="ai-tutor-welcome-card">
            <div className="welcome-mascot">🤖</div>
            <h4>{lang === 'hi' ? 'नमस्ते! मैं आपका एआई ट्यूटर हूँ।' : 'Hello! I am your PacePath AI Tutor.'}</h4>
            <p>
              {lang === 'hi'
                ? 'मुझसे गणित का कोई भी सवाल पूछें, या अपनी नोटबुक या किताब की फ़ोटो खींचकर भेजें। मैं आपको चरण-दर-चरण सिखाऊँगा!'
                : 'Ask me any NCERT math question or take a clear photo of your notebook/book problem. I will guide you step by step with hints!'}
            </p>
            <div className="safety-callout">
              <span className="safety-icon">🛡️</span>
              <span>
                {lang === 'hi'
                  ? 'सुरक्षित अध्ययन: कृपया चेहरे या व्यक्तिगत जानकारी की तस्वीरें न लें।'
                  : 'Study safety: Capture only the problem. Never include faces or personal details.'}
              </span>
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isStudent = m.senderRole === 'student'
          return (
            <div
              key={m.id}
              className={`ai-message-row ${isStudent ? 'row-student' : 'row-assistant'}`}
            >
              {!isStudent && <div className="assistant-mini-avatar">🤖</div>}
              <div className={`ai-message-bubble ${isStudent ? 'bubble-student' : 'bubble-assistant'}`}>
                {m.hasImage && (
                  <div className="message-image-indicator">
                    📷 <em>{lang === 'hi' ? 'फ़ोटो संलग्न' : 'Photo Attached'}</em>
                  </div>
                )}
                <div className="message-text-content">
                  {m.verification?.cleanText ? m.verification.cleanText : m.content}
                </div>

                {/* Math Verification Badge */}
                {m.verification && m.verification.hasEquation && (
                  <div
                    className={`ai-math-badge ${
                      m.verification.status === 'verified'
                        ? 'badge-verified'
                        : m.verification.status === 'divergent'
                        ? 'badge-divergent'
                        : 'badge-unverified'
                    }`}
                  >
                    {m.verification.status === 'verified' && (
                      <span>{m.verification.message || '✓ Verified by PacePath maths engine'}</span>
                    )}
                    {m.verification.status === 'divergent' && (
                      <span>⚠️ {m.verification.message}</span>
                    )}
                    {m.verification.status === 'unverified' && (
                      <span>ℹ️ {m.verification.message}</span>
                    )}
                  </div>
                )}

                <div className="message-time">
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}

        {/* Loading / Typing indicator */}
        {isLoading && (
          <div className="ai-message-row row-assistant">
            <div className="assistant-mini-avatar">🤖</div>
            <div className="ai-message-bubble bubble-assistant typing-indicator">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="ai-tutor-chips-bar">
        {quickChips.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            className="ai-quick-chip"
            onClick={() => handleSendMessage(chip[lang])}
            disabled={isLoading || !isOnline}
          >
            {chip[lang]}
          </button>
        ))}
      </div>

      {/* Photo Preview (if attached) */}
      {imagePreviewUrl && (
        <div className="ai-photo-preview-bar">
          <div className="photo-thumb-wrap">
            <img src={imagePreviewUrl} alt="Attached problem" className="photo-thumb" />
            <button
              type="button"
              className="photo-remove-btn"
              onClick={handleRemoveImage}
              title="Remove photo"
            >
              ✕
            </button>
          </div>
          <div className="photo-preview-tip">
            <span>📷 {lang === 'hi' ? 'फ़ोटो तैयार (EXIF साफ़ किया गया)' : 'Ready to send (EXIF stripped)'}</span>
            <small>{lang === 'hi' ? 'केवल गणित का सवाल भेजें' : 'Maths problem only'}</small>
          </div>
        </div>
      )}

      {/* Compression loading indicator */}
      {isCompressing && (
        <div className="ai-compressing-status">
          <span>🔄 {lang === 'hi' ? 'फ़ोटो अनुकूलित हो रही है...' : 'Optimizing photo for fast delivery...'}</span>
        </div>
      )}

      {/* Input Form */}
      <div className="ai-tutor-input-bar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />

        <button
          type="button"
          className="btn btn-secondary ai-camera-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || !isOnline || isCompressing}
          title={lang === 'hi' ? 'फ़ोटो लें या अपलोड करें' : 'Take or upload photo'}
        >
          📷
        </button>

        <textarea
          className="ai-chat-input"
          rows={1}
          placeholder={
            !isOnline
              ? lang === 'hi' ? 'ऑफ़लाइन - इंटरनेट से जुड़ें...' : 'Offline - connect to internet...'
              : lang === 'hi' ? 'गणित का सवाल पूछें (उदा. 2(x+3)=14 कैसे हल करें?)...' : 'Ask a question or explain where you got stuck...'
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          disabled={isLoading || !isOnline}
          maxLength={1000}
        />

        <button
          type="button"
          className="btn btn-primary ai-send-btn"
          onClick={() => handleSendMessage()}
          disabled={isLoading || !isOnline || (!inputText.trim() && !attachedImage)}
        >
          {lang === 'hi' ? 'भेजें 🚀' : 'Send 🚀'}
        </button>
      </div>

      <div className="ai-tutor-footer-notice">
        <span>
          {lang === 'hi'
            ? 'एआई ट्यूटर सीखने में मदद करता है। महत्वपूर्ण गणनाओं को पेसपाथ मैथ्स इंजन द्वारा सत्यापित किया जाता है।'
            : 'AI Tutor assists learning. Equations are verified by the PacePath offline math engine.'}
        </span>
      </div>
    </div>
  )
}
