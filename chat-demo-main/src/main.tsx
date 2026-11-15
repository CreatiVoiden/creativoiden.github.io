import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { isUnlocked, LockScreen } from './components/auth/LockScreen.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

/** 密码门之后再挂载整个应用：未解锁时不加载、也不初始化任何对话数据 */
const Root = () => {
  const [unlocked, setUnlocked] = useState(isUnlocked)
  return unlocked ? <App /> : <LockScreen onUnlock={() => setUnlocked(true)} />
}

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
