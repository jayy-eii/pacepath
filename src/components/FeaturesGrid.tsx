import { motion } from 'framer-motion'
import { fadeUp, staggerParent } from '../motion/presets'
import type { Language } from '../types'

interface FeaturesGridProps {
  lang?: Language
}

interface FeatureItem {
  id: string
  title: string
  desc: string
  status: 'live' | 'coming_soon'
  icon: string
}

export function FeaturesGrid({ lang = 'en' }: FeaturesGridProps) {
  const isHi = lang === 'hi'

  const studentFeatures: FeatureItem[] = [
    {
      id: 's-adaptive',
      title: isHi ? 'अनुकूली BKT गणित अभ्यास' : 'Adaptive BKT Practice',
      desc: isHi
        ? 'बेयसियन नॉलेज ट्रेसिंग द्वारा संचालित, जो प्रत्येक सही/गलत उत्तर के बाद महारत का पुनर्मूल्यांकन करता है।'
        : 'Bayesian Knowledge Tracing engine updates your mastery probability P(L) after every single question.',
      status: 'live',
      icon: '⚡',
    },
    {
      id: 's-gap',
      title: isHi ? 'रूट-कॉज गैप डिटेक्टिव' : 'Root-Cause Gap Detective',
      desc: isHi
        ? 'यदि आप समीकरण में अटकते हैं, तो सिस्टम 22-अवधारणा DAG ग्राफ पर पीछे जाकर भिन्न या ऋणात्मक संख्याओं की कमी ढूंढता है।'
        : 'When you struggle on advanced concepts, the 22-node DAG traces backwards to isolate missing prerequisites.',
      status: 'live',
      icon: '🧠',
    },
    {
      id: 's-misc',
      title: isHi ? 'प्रक्रियात्मक भ्रांति जासूस' : 'Procedural Misconception Detective',
      desc: isHi
        ? 'यह सिर्फ गलत नहीं कहता—ब्राउज़र के अंदर स्थानीय रूप से सिमुलेट करता है कि आपने कौन सा गलत नियम लगाया।'
        : 'Simulates the exact flawed mathematical procedure step-by-step locally in your browser.',
      status: 'live',
      icon: '🔍',
    },
    {
      id: 's-tests',
      title: isHi ? 'कक्षा टेस्ट एवं असाइनमेंट' : 'Assigned Tests & Offline Submissions',
      desc: isHi
        ? 'शिक्षक द्वारा दिए गए टेस्ट ऑफ़लाइन हल करें; इंटरनेट मिलते ही आउटबॉक्स द्वारा अपने-आप सिंक होते हैं।'
        : 'Take teacher-assigned timed tests offline; answers queue in Dexie and sync via outbox when reconnected.',
      status: 'live',
      icon: '📝',
    },
    {
      id: 's-doubts',
      title: isHi ? 'शिक्षक से शंका समाधान' : 'Ask Teacher Doubts Thread',
      desc: isHi
        ? 'कठिन प्रश्न पर सीधे शिक्षक को शंका भेजें और दोनों तरफ से संदेशों का आदान-प्रदान करें।'
        : 'Send doubts directly to your teacher with contextual question data and view their replies.',
      status: 'live',
      icon: '💬',
    },
    {
      id: 's-aitutor',
      title: isHi ? 'एआई अध्ययन ट्यूटर (टेक्स्ट + फ़ोटो)' : 'AI Study Tutor (Text + Photo)',
      desc: isHi
        ? 'कक्षा 6–10 एनसीईआरटी गणित के लिए सुरक्षित एआई ट्यूटर। प्रश्न पूछें या फ़ोटो अपलोड करें; पेसपाथ मैथ्स इंजन द्वारा गणना सत्यापित।'
        : 'Safe, hint-first AI tutor for Classes 6–10 NCERT maths. Ask questions or upload notebook photos; verified by offline math engine.',
      status: 'live',
      icon: '🤖',
    },
    {
      id: 's-learn',
      title: isHi ? 'अवधारणा दृश्य पाठ (Learn Modules)' : 'Concept Visual Learn Modules',
      desc: isHi
        ? 'अभ्यास से पहले त्वरित 2 मिनट के संवादात्मक स्पष्टीकरण और दृश्य मॉडल।'
        : 'Short interactive visual explanations designed for 2-minute clarity before jumping into questions.',
      status: 'coming_soon',
      icon: '📘',
    },
    {
      id: 's-streaks',
      title: isHi ? 'गेमीफाइड स्ट्रीक्स एवं बैज' : 'Gamified Streaks & Badges',
      desc: isHi
        ? 'दैनिक निरंतरता और स्तर-आधारित बैज जो छात्रों को नियमित अभ्यास के लिए प्रेरित करते हैं।'
        : 'Daily practice streak multipliers, mastery milestones, and level badges for self-driven motivation.',
      status: 'coming_soon',
      icon: '🔥',
    },
  ]

  const teacherFeatures: FeatureItem[] = [
    {
      id: 't-heatmap',
      title: isHi ? 'लाइव क्लास मास्टरी हीटमैप' : 'Live Class Mastery Heatmap',
      desc: isHi
        ? 'सभी 22 अवधारणाओं में पूरी कक्षा की महारत (0-100%) का रंग-कोडित मैट्रिक्स दृश्य।'
        : 'Color-coded matrix showing real-time student mastery percentages across all 22 syllabus concepts.',
      status: 'live',
      icon: '🗺️',
    },
    {
      id: 't-groups',
      title: isHi ? 'स्वतः उपचारात्मक समूह' : 'Automatic Remedial Groups',
      desc: isHi
        ? 'समान भ्रांति या एक जैसी कमी वाले विद्यार्थियों का स्वतः क्लस्टरिंग (जैसे कोष्ठक वितरण समूह)।'
        : 'Automatically clusters students who share the exact same procedural misconception or prerequisite gap.',
      status: 'live',
      icon: '👥',
    },
    {
      id: 't-action',
      title: isHi ? '10-मिनट उपचारात्मक एक्शन कार्ड्स' : '10-Minute Action Cards',
      desc: isHi
        ? 'कक्षा के लिए तैयार व्यावहारिक सुझाव कि किस समूह को अगले 10 मिनट में क्या सिखाना है।'
        : 'Actionable teaching prompts suggesting exactly what micro-lesson to conduct for struggling clusters.',
      status: 'live',
      icon: '🎯',
    },
    {
      id: 't-wizard',
      title: isHi ? 'टेस्ट निर्माण विज़ार्ड' : 'Test Creation Wizard',
      desc: isHi
        ? 'बैंक से प्रश्न चुनें, समय सीमा तय करें, उत्तर कुंजी प्रकटीकरण नियम और नियत तारीख निर्धारित करें।'
        : 'Create custom timed tests from the 104-question bank with due dates, close dates, and answer key controls.',
      status: 'live',
      icon: '📋',
    },
    {
      id: 't-drawer',
      title: isHi ? 'छात्र प्रोफाइल एवं इतिहास' : 'Student Drawer & Detailed History',
      desc: isHi
        ? 'प्रत्येक छात्र के व्यक्तिगत प्रयास, समय, सक्रिय अंतराल और भ्रांति लॉग्स का गहरा विश्लेषण।'
        : 'Deep dive into any student&apos;s individual attempts, active time, diagnosed gaps, and misconception events.',
      status: 'live',
      icon: '👤',
    },
    {
      id: 't-misc-board',
      title: isHi ? 'कक्षा भ्रांति बोर्ड' : 'Class Misconception Board',
      desc: isHi
        ? 'कक्षा में सबसे अधिक दोहराई जाने वाली मानसिक त्रुटियों का संकलित दृश्य और चेतावनी अलर्ट।'
        : 'Cohort-level procedural misconception rankings and multi-student alert triggers (>=3 students & >=5 events).',
      status: 'live',
      icon: '🚨',
    },
    {
      id: 't-aitutor',
      title: isHi ? 'एआई ट्यूटर सुरक्षा एवं मांग अंतर्दृष्टि' : 'AI Tutor Analytics & Safety Oversight',
      desc: isHi
        ? 'छात्रों के प्रश्नों, फ़ोटो उपयोग की निगरानी, सुरक्षा फ्लैग समीक्षा, और सामूहिक अवधारणा मांग (≥3 छात्र) का स्वतः पता लगाना।'
        : 'Monitor student AI queries, photo uploads, safety flags, and detect class-wide concept demand (≥3 students).',
      status: 'live',
      icon: '🛡️',
    },
    {
      id: 't-parents',
      title: isHi ? 'अभिभावक दैनिक प्रगति रिपोर्ट' : 'Parent Daily Progress Reports',
      desc: isHi
        ? 'अभिभावकों को व्हाट्सएप/एसएमएस द्वारा बच्चे की वास्तविक प्रगति और सुधार का स्वतः संदेश।'
        : 'Automated daily progress SMS/WhatsApp summaries celebrating student wins and mastery progress.',
      status: 'coming_soon',
      icon: '📱',
    },
  ]

  return (
    <section className="features-grid-section" id="features">
      <div className="container features-grid-inner">
        <motion.div
          className="features-header"
          variants={staggerParent(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.p variants={fadeUp} className="scene-kicker">
            {isHi ? 'विस्तृत क्षमताएं' : 'Platform Features'}
          </motion.p>
          <motion.h2 variants={fadeUp} className="scene-title">
            {isHi ? (
              <>छात्रों और शिक्षकों के लिए <span className="gradient-text">अलग-अलग क्षमताएं</span></>
            ) : (
              <>Engineered for both <span className="gradient-text">Learners & Educators</span></>
            )}
          </motion.h2>
          <motion.p variants={fadeUp} className="scene-sub">
            {isHi
              ? 'सख्त पारदर्शिता: सक्रिय सुविधाओं और आगामी विकास चरणों की स्पष्ट स्थिति।'
              : 'Strict transparency: every feature status is explicitly marked as Live or Coming soon.'}
          </motion.p>
        </motion.div>

        <div className="features-columns-wrapper">
          {/* Column 1: For Students */}
          <div className="features-col">
            <div className="features-col-header features-col-header--student">
              <span className="col-icon">🎓</span>
              <div>
                <h3>{isHi ? 'विद्यार्थियों के लिए' : 'For Students'}</h3>
                <p>{isHi ? 'स्व-गति से महारत और स्पष्ट निदान' : 'Self-paced mastery with instant diagnostic clarity'}</p>
              </div>
            </div>

            <div className="features-cards-list">
              {studentFeatures.map((item) => (
                <div key={item.id} className={`feature-item-card feature-item-card--${item.status}`}>
                  <div className="feature-item-top">
                    <span className="feature-item-icon">{item.icon}</span>
                    <span className={`status-chip status-chip--${item.status}`}>
                      {item.status === 'live' ? '● ' : '○ '}
                      {item.status === 'live' ? (isHi ? 'सक्रिय (Live)' : 'Live') : (isHi ? 'जल्द आ रहा है' : 'Coming soon')}
                    </span>
                  </div>
                  <h4 className="feature-item-title">{item.title}</h4>
                  <p className="feature-item-desc">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: For Teachers */}
          <div className="features-col">
            <div className="features-col-header features-col-header--teacher">
              <span className="col-icon">🏫</span>
              <div>
                <h3>{isHi ? 'शिक्षकों के लिए' : 'For Teachers'}</h3>
                <p>{isHi ? 'कक्षा की वास्तविक अंतर्दृष्टि और त्वरित 10-मिनट योजना' : 'Cohort analytics and rapid 10-minute targeted interventions'}</p>
              </div>
            </div>

            <div className="features-cards-list">
              {teacherFeatures.map((item) => (
                <div key={item.id} className={`feature-item-card feature-item-card--${item.status}`}>
                  <div className="feature-item-top">
                    <span className="feature-item-icon">{item.icon}</span>
                    <span className={`status-chip status-chip--${item.status}`}>
                      {item.status === 'live' ? '● ' : '○ '}
                      {item.status === 'live' ? (isHi ? 'सक्रिय (Live)' : 'Live') : (isHi ? 'जल्द आ रहा है' : 'Coming soon')}
                    </span>
                  </div>
                  <h4 className="feature-item-title">{item.title}</h4>
                  <p className="feature-item-desc">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
