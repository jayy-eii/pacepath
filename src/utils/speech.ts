import type { Language } from '../types'

let currentUtterance: SpeechSynthesisUtterance | null = null

export function speakText(
  text: string,
  lang: Language,
  onEnd?: () => void,
  onError?: () => void,
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis is not supported in this browser.')
    return false
  }

  // If already speaking, cancel
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
  utterance.rate = 0.95
  utterance.pitch = 1.0

  // Try to find a matching voice if voices are loaded
  const voices = window.speechSynthesis.getVoices()
  const matchingVoice = voices.find((v) =>
    lang === 'hi' ? v.lang.startsWith('hi') : v.lang.startsWith('en-IN') || v.lang.startsWith('en'),
  )
  if (matchingVoice) {
    utterance.voice = matchingVoice
  }

  utterance.onend = () => {
    currentUtterance = null
    onEnd?.()
  }

  utterance.onerror = (e) => {
    // If canceled manually, do not treat as an error
    if (e.error !== 'canceled' && e.error !== 'interrupted') {
      console.warn('Speech synthesis error:', e)
    }
    currentUtterance = null
    onError?.()
  }

  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
  return true
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }
}

export function isSpeaking(): boolean {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking || currentUtterance !== null
  }
  return false
}
