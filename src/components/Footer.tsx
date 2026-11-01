import { Mascot } from './Mascot'
import type { Language } from '../types'

interface FooterProps {
  lang?: Language
  onOpenDev?: () => void
}

export function Footer({ lang = 'en', onOpenDev }: FooterProps) {
  const isHi = lang === 'hi'

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-top-row">
          <div className="footer-brand">
            <div className="footer-logo">
              <Mascot size={28} mood="idle" />
              <span className="brand-name">PacePath</span>
            </div>
            <p className="footer-tagline">
              {isHi
                ? 'कक्षा 6–10 गणित के लिए अनुकूली शिक्षण एवं संज्ञानात्मक भ्रांति जासूस।'
                : 'Adaptive learning and cognitive misconception detective for Class 6–10 mathematics.'}
            </p>
          </div>

          <div className="footer-hackathon-badge">
            <span className="competition-tag">Code Kernel &apos;26</span>
            <span className="motto-tag">Decode • Build • Prove</span>
          </div>
        </div>

        <div className="footer-disclaimer-row">
          <p className="disclaimer-text">
            {isHi
              ? 'अस्वीकरण: पहले लॉगिन के बाद ऑफ़लाइन काम करता है और ऑनलाइन आने पर सिंक होता है। लैंडिंग पेज पर दिखाए गए दृश्य चित्र स्पष्ट रूप से लेबल किए गए हैं और उदाहरण स्वरूप हैं।'
              : 'Notice: Works offline after your first login and syncs when you are online. Landing page visual illustrations are clearly labelled and use illustrative demo data.'}
          </p>

          <div className="footer-links">
            {import.meta.env.DEV && onOpenDev && (
              <button type="button" className="footer-dev-link" onClick={onOpenDev}>
                🛠️ Dev DB Inspector
              </button>
            )}
            <span className="footer-copy">© 2026 PacePath</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
