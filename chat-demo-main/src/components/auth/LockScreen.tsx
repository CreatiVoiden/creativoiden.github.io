import { useState, type FormEvent } from 'react'
import { matchesAccessPassword, UNLOCK_TOKEN } from '../../config.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './LockScreen.module.css'

const STORAGE_KEY = 'ai:unlocked'

/** 解锁一次后长期有效，直到清空站点数据或换密码 */
export const isUnlocked = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === UNLOCK_TOKEN
  } catch {
    return false
  }
}

const rememberUnlock = () => {
  try {
    localStorage.setItem(STORAGE_KEY, UNLOCK_TOKEN)
  } catch {
    // 隐私模式下写不进本地存储时，只对当前这次打开有效
  }
}

/** 密码门：未解锁前不渲染聊天界面，避免别人直接用绑定的 Key */
export const LockScreen = ({ onUnlock }: { onUnlock: () => void }) => {
  const t = useTranslate()
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!matchesAccessPassword(value.trim())) {
      setWrong(true)
      return
    }
    rememberUnlock()
    onUnlock()
  }

  return (
    <div className={styles.lock}>
      <form className={styles.card} onSubmit={onSubmit}>
        <div className={styles.title}>{t('lockTitle')}</div>
        <div className={styles.description}>{t('lockDescription')}</div>
        <input
          className={styles.input}
          type="password"
          autoFocus
          autoComplete="current-password"
          aria-label={t('lockPasswordPlaceholder')}
          value={value}
          placeholder={t('lockPasswordPlaceholder')}
          onChange={(event) => {
            setValue(event.target.value)
            setWrong(false)
          }}
        />
        {wrong ? (
          <div className={styles.error} role="alert">
            {t('lockWrongPassword')}
          </div>
        ) : null}
        <button className={styles.submit} type="submit" disabled={value.trim() === ''}>
          {t('lockEnter')}
        </button>
      </form>
    </div>
  )
}
