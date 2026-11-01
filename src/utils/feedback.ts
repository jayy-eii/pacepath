import type { MistakeTag, LocalizedText } from '../types'

export const MISTAKE_FRIENDLY_MESSAGES: Record<MistakeTag, LocalizedText> = {
  added_denominators: {
    en: 'Careful with fractions! Denominators stay the same — we only add or subtract the numerators on top.',
    hi: 'भिन्न में ध्यान दें! हर (नीचे की संख्या) समान रहता है — हम केवल ऊपर के अंशों को जोड़ते या घटाते हैं।',
  },
  sign_error: {
    en: 'Almost there! Watch the positive (+) and negative (-) signs carefully when moving terms across the equals sign.',
    hi: 'बहुत करीब! बराबर के दूसरी तरफ ले जाते समय (+) और (-) चिन्हों का विशेष ध्यान रखें।',
  },
  calculation_slip: {
    en: 'Great approach! It looks like a tiny counting or multiplication slip along the way.',
    hi: 'सोच बिल्कुल सही थी! लगता है गणना या गुणा में एक छोटी सी चूक हो गई।',
  },
  formula_misuse: {
    en: 'Check the operation order: remember to undo addition or subtraction before multiplying or dividing.',
    hi: 'संक्रिया के क्रम की जाँच करें: गुणा या भाग करने से पहले जोड़ या घटाव को सुलझाएं।',
  },
  concept_gap: {
    en: 'This concept has a special rule! Let’s walk through the solution below to make it click.',
    hi: 'इस सवाल में एक विशेष नियम लगता है। इसे समझने के लिए नीचे दिए गए हल को देखें!',
  },
  other: {
    en: 'Good try! Every attempt helps your maths muscles grow. Check out the worked solution below.',
    hi: 'अच्छा प्रयास! हर सवाल आपको और होशियार बनाता है। नीचे दिए गए हल को देखें।',
  },
}

export function getMistakeMessage(tag: MistakeTag | null | undefined): LocalizedText {
  if (!tag || !MISTAKE_FRIENDLY_MESSAGES[tag]) {
    return {
      en: 'Good effort! Check out the step-by-step solution below to see how it works.',
      hi: 'अच्छा प्रयास! यह कैसे हल होता है, इसे समझने के लिए नीचे दिए गए हल को देखें।',
    }
  }
  return MISTAKE_FRIENDLY_MESSAGES[tag]
}
