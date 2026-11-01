import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReducedMotionProvider } from './motion/reducedMotion'
import { MotionGate } from './motion/MotionGate'
import { SmoothScroll } from './motion/SmoothScroll'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReducedMotionProvider>
      <MotionGate>
        <SmoothScroll>
          <App />
        </SmoothScroll>
      </MotionGate>
    </ReducedMotionProvider>
  </StrictMode>,
)
