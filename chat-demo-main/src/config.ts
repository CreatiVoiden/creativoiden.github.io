/**
 * 部署配置。
 *
 * 这是纯静态站点：下面两项都会被打进 JS 包，任何人打开开发者工具或直接看
 * 仓库源码都能读到。密码只是拦住随手访问，不是真正的权限控制；要真正保护
 * Key，需要接一个自己的转发服务（例如 Cloudflare Worker）。
 */

/** 页面固定使用的 API Key，界面上不再提供修改入口 */
export const FIXED_API_KEY = 'sk-659583c144cf44e6b9abe860aa79f948'

/**
 * 访问密码。改成自己的密码后重新构建即可生效。
 * 密码一变，之前解锁过的浏览器会自动重新要求输入。
 */
export const ACCESS_PASSWORD = 'voiden2026'

/** 由密码派生解锁标记：本地只存标记，不存密码本身 */
const tokenOf = (value: string): string => {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0
  }
  return `ai-v1-${hash.toString(36)}`
}

/** 解锁后写进 localStorage 的值 */
export const UNLOCK_TOKEN = tokenOf(ACCESS_PASSWORD)

/** 校验输入的密码 */
export const matchesAccessPassword = (input: string): boolean => tokenOf(input) === UNLOCK_TOKEN
