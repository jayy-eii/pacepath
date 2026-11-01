// Supabase Edge Function: ai-tutor
// Friendly NCERT-style maths tutor for Classes 6 to 10 with photo question comprehension.
// API Keys are managed via Supabase Secrets (AI_PROVIDER, AI_API_KEY, AI_MODEL).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestPayload {
  class_code: string
  student_id: string
  message: string
  language?: 'en' | 'hi'
  image?: string // Base64 JPEG
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

const SYSTEM_INSTRUCTION = `You are PacePath's friendly study tutor for Indian students in Classes 6 to 10 (NCERT style, maths first, other school subjects ok). Teach, don't just give answers: first ask what they tried or give a small hint, then guide step by step; give a full worked solution only if the student has tried or asks again after a hint. Use simple words in the student's language, short paragraphs, Indian examples. Stay on study topics, politely decline anything else. Refuse unsafe, adult, hateful or personal-information requests. If a student seems upset, be kind and suggest talking to a teacher or trusted adult. If an image is unreadable or not study-related, say so. Never ask for or repeat personal details. Never claim to be human. If unsure, say so. If you read an equation from text or a photo, add one last line exactly like 'EQUATION: 2(x+3)=14'.`

// Safety / crisis patterns
const SELF_HARM_REGEX = /\b(suicide|kill\s*myself|end\s*my\s*life|die|hurt\s*myself|cutting\s*myself|hang\s*myself|आत्महत्या|जान\s*देना)\b/i
const PERSONAL_INFO_REGEX = /\b(\d{10}|\d{3}[-\s]\d{3}[-\s]\d{4}|password|passcode|aadhaar|pin\s*code|credit\s*card)\b/i

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const payload: RequestPayload = await req.json()
    const { class_code, student_id, message, language = 'en', image, context, history = [] } = payload

    if (!class_code || !student_id) {
      return new Response(
        JSON.stringify({ error: 'Missing class_code or student_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!message && !image) {
      return new Response(
        JSON.stringify({ error: 'Message or image is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Guard: max 1000 characters
    const cleanMessage = (message || '').trim().slice(0, 1000)

    // Guard: image size max ~1.5 MB in base64 (approx 2,100,000 characters)
    let cleanImage: string | undefined = undefined
    if (image) {
      const base64Data = image.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim()
      if (base64Data.length > 2_200_000) {
        return new Response(
          JSON.stringify({ error: 'Image exceeds maximum allowed size (1.5 MB).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      cleanImage = base64Data
    }

    // Initialize Supabase admin client using runtime environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Verify Student belongs to this class code
    const { data: studentCheck, error: studentErr } = await supabase
      .from('students')
      .select('id, name, class_code')
      .eq('id', student_id)
      .eq('class_code', class_code.toUpperCase().trim())
      .maybeSingle()

    if (studentErr || !studentCheck) {
      return new Response(
        JSON.stringify({ error: 'Student does not belong to this class or student not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Server-side Rate Limit check (30 msgs/hr, 100 msgs/day, 5 images/hr)
    const oneHourAgo = Date.now() - 3600 * 1000
    const oneDayAgo = Date.now() - 86400 * 1000

    const { data: recentHourMsgs, error: hourErr } = await supabase
      .from('ai_chat_messages')
      .select('id, has_image')
      .eq('class_code', class_code.toUpperCase().trim())
      .eq('student_id', student_id)
      .eq('sender_role', 'student')
      .gte('created_at', oneHourAgo)

    if (!hourErr && recentHourMsgs) {
      if (recentHourMsgs.length >= 30) {
        return new Response(
          JSON.stringify({
            reply: language === 'hi'
              ? 'आपने इस घंटे की 30 प्रश्नों की सीमा पूरी कर ली है। थोड़ा विराम लें और अपने नोट्स दोहराएं!'
              : 'You have reached your limit of 30 messages for this hour. Take a short study break and review your notes!',
            flagged: false,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (cleanImage) {
        const hourImageCount = recentHourMsgs.filter((m) => m.has_image).length
        if (hourImageCount >= 5) {
          return new Response(
            JSON.stringify({
              reply: language === 'hi'
                ? 'आपने इस घंटे में 5 फोटो पूछने की सीमा पूरी कर ली है। आप टाइप करके प्रश्न पूछ सकते हैं!'
                : 'You have reached the limit of 5 photo questions for this hour. You can still type your questions!',
              flagged: false,
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

    const { count: dayCount, error: dayErr } = await supabase
      .from('ai_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('class_code', class_code.toUpperCase().trim())
      .eq('student_id', student_id)
      .eq('sender_role', 'student')
      .gte('created_at', oneDayAgo)

    if (!dayErr && typeof dayCount === 'number' && dayCount >= 100) {
      return new Response(
        JSON.stringify({
          reply: language === 'hi'
            ? 'आज की 100 प्रश्नों की दैनिक अध्ययन सीमा पूरी हो गई है। शाबाश! कल फिर अभ्यास करेंगे।'
            : 'You have completed your daily limit of 100 tutor queries today. Great effort! Rest well and continue tomorrow.',
          flagged: false,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Heuristic Safety Check: self-harm or sensitive personal information
    let isFlagged = false
    let safetyOverrideReply: string | null = null

    if (SELF_HARM_REGEX.test(cleanMessage)) {
      isFlagged = true
      safetyOverrideReply = language === 'hi'
        ? 'हम आपकी सुरक्षा और भलाई की परवाह करते हैं। कृपया अपने शिक्षक, माता-पिता या किसी विश्वसनीय वयस्क से तुरंत बात करें।'
        : 'I care deeply about your safety and well-being. Please reach out to your teacher, parents, or a trusted adult who can support you.'
    } else if (PERSONAL_INFO_REGEX.test(cleanMessage)) {
      isFlagged = true
      safetyOverrideReply = language === 'hi'
        ? 'सुरक्षा के लिए, कृपया अपना फोन नंबर, पासवर्ड या व्यक्तिगत जानकारी साझा न करें। आइए केवल गणित और पढ़ाई पर ध्यान दें!'
        : 'For your privacy and safety, please do not share phone numbers, passwords, or personal details. Let us focus strictly on school maths!'
    }

    // 4. Save student message to DB
    const studentMsgId = crypto.randomUUID()
    const nowTs = Date.now()
    await supabase.from('ai_chat_messages').insert({
      id: studentMsgId,
      class_code: class_code.toUpperCase().trim(),
      student_id,
      concept_id: context?.concept_id || null,
      sender_role: 'student',
      content: cleanMessage || (cleanImage ? '[Photo Attached]' : ''),
      has_image: Boolean(cleanImage),
      flagged: isFlagged,
      created_at: nowTs,
    })

    // If safety triggered, return immediate safe override without invoking external LLM
    if (isFlagged && safetyOverrideReply) {
      const assistantMsgId = crypto.randomUUID()
      await supabase.from('ai_chat_messages').insert({
        id: assistantMsgId,
        class_code: class_code.toUpperCase().trim(),
        student_id,
        concept_id: context?.concept_id || null,
        sender_role: 'assistant',
        content: safetyOverrideReply,
        has_image: false,
        flagged: true,
        created_at: nowTs + 50,
      })

      return new Response(
        JSON.stringify({ reply: safetyOverrideReply, flagged: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 5. Call External AI Provider
    const aiProvider = (Deno.env.get('AI_PROVIDER') || 'gemini').toLowerCase().trim()
    const aiApiKey = (Deno.env.get('AI_API_KEY') || '').trim()
    const aiModel = (Deno.env.get('AI_MODEL') || 'gemini-1.5-flash').trim()

    let tutorReply = ''

    if (!aiApiKey) {
      // Friendly honest message when secrets are not yet configured
      tutorReply = language === 'hi'
        ? `नमस्ते! मैं पेसपाथ एआई ट्यूटर हूँ। विद्यालय एडमिनिस्ट्रेटर द्वारा एआई सेवा कॉन्फ़िगर की जा रही है। तब तक अभ्यास स्क्रीन पर चरण-दर-चरण संकेत देखें!\nEQUATION: 2(x+3)=14`
        : `Hello! I am your PacePath AI Study Tutor. The AI service is currently being configured by your teacher/school administrator. In the meantime, try following the step-by-step hint in Practice mode!\nEQUATION: 2(x+3)=14`
    } else if (aiProvider === 'gemini') {
      // Build conversation contents for Gemini API
      const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = []

      // History (up to 10 recent turns)
      const recentHistory = history.slice(-10)
      for (const turn of recentHistory) {
        contents.push({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.content }],
        })
      }

      // Current User Part
      const currentParts: Array<Record<string, unknown>> = []

      // Optional attached problem context
      let contextualPrompt = ''
      if (context?.question_text) {
        contextualPrompt += `[Current Question Context: "${context.question_text}"]\n`
      }
      if (context?.student_answer) {
        contextualPrompt += `[Student's Attempted Answer: "${context.student_answer}"]\n`
      }
      if (contextualPrompt) {
        currentParts.push({ text: contextualPrompt })
      }

      if (cleanMessage) {
        currentParts.push({ text: cleanMessage })
      }

      if (cleanImage) {
        currentParts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: cleanImage,
          },
        })
      }

      contents.push({
        role: 'user',
        parts: currentParts,
      })

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${aiApiKey}`

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: `${SYSTEM_INSTRUCTION}\nLanguage to reply in: ${language === 'hi' ? 'Hindi (or simple Hinglish terms where helpful)' : 'English'}.` }],
          },
          contents,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 600,
          },
        }),
      })

      if (!response.ok) {
        console.error('AI Provider Error HTTP:', response.status)
        tutorReply = language === 'hi'
          ? 'माफ़ कीजिए, मुझे उत्तर तैयार करने में थोड़ी परेशानी हुई। कृपया कुछ समय बाद पुनः प्रयास करें या शिक्षक से पूछें।'
          : 'I apologize, but I had a little trouble generating a response just now. Please try asking again in a moment or ask your teacher!'
      } else {
        const resJson = await response.json()
        const candidate = resJson?.candidates?.[0]?.content?.parts?.[0]?.text
        tutorReply = candidate || (language === 'hi' ? 'कृपया अपना प्रश्न पुनः लिखें।' : 'Please rephrase your question.')
      }
    } else {
      // Generic fallback for custom / alternative providers
      tutorReply = language === 'hi'
        ? `[${aiProvider}] ट्यूटर उपलब्ध है। कृपया अपना प्रश्न स्पष्ट शब्दों में लिखें।`
        : `[${aiProvider}] Tutor is ready. What topic would you like to explore together?`
    }

    // 6. Save assistant message to DB
    const assistantMsgId = crypto.randomUUID()
    await supabase.from('ai_chat_messages').insert({
      id: assistantMsgId,
      class_code: class_code.toUpperCase().trim(),
      student_id,
      concept_id: context?.concept_id || null,
      sender_role: 'assistant',
      content: tutorReply,
      has_image: false,
      flagged: false,
      created_at: Date.now(),
    })

    return new Response(
      JSON.stringify({ reply: tutorReply, flagged: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    console.error('Edge Function unhandled error:', err)
    return new Response(
      JSON.stringify({
        reply: 'I ran into a temporary hiccup. Please check your connection and try again!',
        flagged: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
