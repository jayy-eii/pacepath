import { motion } from 'framer-motion'
import { fadeUp, staggerParent } from '../motion/presets'
import type { Language } from '../types'

interface BuiltForIndiaSectionProps {
  lang?: Language
}

export function BuiltForIndiaSection({ lang = 'en' }: BuiltForIndiaSectionProps) {
  const isHi = lang === 'hi'

  const pillars = [
    {
      id: 'bilingual',
      icon: '🇮🇳',
      title: isHi ? 'द्विभाषी: हिंदी एवं अंग्रेज़ी' : 'Bilingual by Design (Hindi / English)',
      desc: isHi
        ? 'हर प्रश्न, संकेत, समाधान और इंटरफ़ेस एक क्लिक में हिंदी और अंग्रेज़ी के बीच टॉगल होता है। छात्र अपनी सहज भाषा में गणित सीखते हैं।'
        : 'Every question, hint, solution, and feedback message toggles instantly between Hindi and English with zero page reloads.',
      highlight: isHi ? '1-क्लिक भाषा टॉगल' : 'Instant 1-Click Toggle',
    },
    {
      id: 'offline',
      icon: '📶',
      title: isHi ? 'पहले लॉगिन के बाद ऑफ़लाइन' : 'Works Offline After First Login',
      desc: isHi
        ? 'पहले लॉगिन के बाद ऑफ़लाइन काम करता है और ऑनलाइन आने पर सिंक होता है। अस्थिर इंटरनेट वाले ग्रामीण विद्यालयों में भी अभ्यास कभी नहीं रुकता।'
        : 'Works offline after your first login and syncs when you are online. Math practice and tests never pause even when school Wi-Fi drops.',
      highlight: isHi ? 'लोकल-फर्स्ट डेक्सी (IndexedDB)' : 'Dexie IndexedDB Engine',
    },
    {
      id: 'shared-phone',
      icon: '📱',
      title: isHi ? 'साझा फ़ोन और परिवार अनुकूल' : 'Shared Phone & Family Friendly',
      desc: isHi
        ? 'एक ही मोबाइल पर कई भाई-बहन या सहपाठी 4-अंकों के पिन से अपना अलग-अलग सत्र सुरक्षित रूप से चला सकते हैं। प्रगति कभी मिश्रित नहीं होती।'
        : 'Multiple siblings or classmates sharing a single household smartphone can switch profiles safely using a simple 4-digit PIN.',
      highlight: isHi ? 'पिन-आधारित प्रोफ़ाइल' : 'PIN-Protected Sessions',
    },
    {
      id: 'low-data',
      icon: '⚡',
      title: isHi ? 'अति-निम्न डेटा खपत' : 'Low Data & Tiny Payloads',
      desc: isHi
        ? 'शून्य भारी वीडियो या भारी डाउनलोड। पूरा गणितीय इंजन विशुद्ध कोड है और बैकग्राउंड सिंक केवल कुछ किलोबाइट डेटा का उपयोग करता है।'
        : 'Zero heavy video streams or bloated downloads. The math engine runs entirely in pure TypeScript, with background JSON sync batches under 15 KB.',
      highlight: isHi ? '2G/3G नेटवर्क पर सक्षम' : 'Optimized for 2G/3G',
    },
  ]

  return (
    <section className="built-for-india-section" id="built-for-india">
      <div className="container built-for-india-inner">
        <motion.div
          className="built-header"
          variants={staggerParent(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.p variants={fadeUp} className="scene-kicker">
            {isHi ? 'भारतीय कक्षाओं के लिए निर्मित' : 'Ground Reality First'}
          </motion.p>
          <motion.h2 variants={fadeUp} className="scene-title">
            {isHi ? (
              <>भारत की वास्तविकताओं के लिए <span className="gradient-text">विशेष रूप से तैयार</span></>
            ) : (
              <>Engineered for the realities of <span className="gradient-text">Indian Classrooms</span></>
            )}
          </motion.h2>
          <motion.p variants={fadeUp} className="scene-sub">
            {isHi
              ? 'बिना महंगे हार्डवेयर, बिना 5G इंटरनेट और बिना अंग्रेजी की अनिवार्यता के हर बच्चे तक गुणवत्तापूर्ण गणित शिक्षण।'
              : 'Built to deliver deep personalized mathematics without requiring expensive devices, high-speed fiber, or English fluency.'}
          </motion.p>
        </motion.div>

        <div className="built-grid">
          {pillars.map((item, idx) => (
            <motion.div
              key={item.id}
              className="built-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.12, duration: 0.4 }}
              whileHover={{ y: -4 }}
            >
              <div className="built-card-top">
                <span className="built-icon">{item.icon}</span>
                <span className="built-highlight-tag">{item.highlight}</span>
              </div>
              <h3 className="built-title">{item.title}</h3>
              <p className="built-desc">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
