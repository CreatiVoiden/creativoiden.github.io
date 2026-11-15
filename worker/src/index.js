/**
 * Voiden Files API — Cloudflare Worker
 *
 * 存储策略：把上传的文件作为一次 commit 写进 GitHub 仓库的 files/ 目录，
 * 由现有的 GitHub Pages（https://voiden.cn/files/…）对外提供下载。
 *
 * 路由
 *   GET    /health          健康检查
 *   GET    /list            公开：列出 files/ 目录下的文件
 *   POST   /upload          需要密码：raw body 上传，文件名放在 X-File-Name
 *   DELETE /file?name=xxx   需要密码：删除文件
 *
 * 需要的绑定
 *   vars    REPO_OWNER, REPO_NAME, BRANCH, FILES_DIR, PUBLIC_BASE,
 *           ALLOWED_ORIGINS, MAX_FILE_MB
 *   secret  GITHUB_TOKEN（fine-grained PAT，只需该仓库 contents:write）
 *   secret  UPLOAD_PASSWORD
 */

const GITHUB_API = 'https://api.github.com'
const MAX_LIST_FILES = 200

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request.headers.get('Origin'))

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'voiden-files', configured: Boolean(env.GITHUB_TOKEN) }, 200, cors)
      }
      if (url.pathname === '/') {
        return json(
          {
            ok: true,
            service: 'voiden-files',
            routes: ['GET /list', 'POST /upload', 'DELETE /file?name=…'],
          },
          200,
          cors,
        )
      }
      if (url.pathname === '/list' && request.method === 'GET') {
        return await handleList(env, cors)
      }
      if (url.pathname === '/upload' && request.method === 'POST') {
        return await handleUpload(request, env, cors)
      }
      if (url.pathname === '/file' && request.method === 'DELETE') {
        return await handleDelete(request, env, cors)
      }
      return json({ ok: false, error: 'not_found' }, 404, cors)
    } catch (error) {
      return json(
        { ok: false, error: 'server_error', message: String((error && error.message) || error) },
        500,
        cors,
      )
    }
  },
}

/* ---------------------------------------------------------------- utils */

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] || '*'
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-upload-password,x-file-name,x-overwrite',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function safeEqual(a, b) {
  const encoder = new TextEncoder()
  const left = encoder.encode(String(a || ''))
  const right = encoder.encode(String(b || ''))
  if (left.length !== right.length || left.length === 0) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

function repoOf(env) {
  return `${env.REPO_OWNER}/${env.REPO_NAME}`
}

function dirOf(env) {
  return String(env.FILES_DIR || 'files').replace(/^\/+|\/+$/g, '')
}

function encodePath(name) {
  return String(name)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function publicUrl(env, name) {
  return `${String(env.PUBLIC_BASE || 'https://voiden.cn/files').replace(/\/+$/, '')}/${encodePath(name)}`
}

function maxBytes(env) {
  const mb = Number(env.MAX_FILE_MB || 25)
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024
}

async function gh(env, path, init = {}) {
  return await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'voiden-files-worker',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

function listCacheKey(env) {
  return new Request(`https://voiden-files.internal/${repoOf(env)}/${env.BRANCH}/${dirOf(env)}/list`)
}

async function rawDirEntries(env) {
  const res = await gh(
    env,
    `/repos/${repoOf(env)}/contents/${encodePath(dirOf(env))}?ref=${encodeURIComponent(env.BRANCH)}`,
  )
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`github list failed: ${res.status} ${await res.text()}`)
  const items = await res.json()
  if (!Array.isArray(items)) return []
  return items.filter((item) => item.type === 'file' && !item.name.startsWith('.'))
}

async function listNames(env) {
  const entries = await rawDirEntries(env)
  return new Set(entries.map((entry) => entry.name))
}

async function getSha(env, name) {
  const res = await gh(
    env,
    `/repos/${repoOf(env)}/contents/${encodePath(dirOf(env))}/${encodePath(name)}?ref=${encodeURIComponent(env.BRANCH)}`,
  )
  if (!res.ok) return null
  const data = await res.json()
  return data && data.sha ? data.sha : null
}

async function lastCommitDate(env, name) {
  const path = `${dirOf(env)}/${name}`
  const res = await gh(
    env,
    `/repos/${repoOf(env)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(env.BRANCH)}&per_page=1`,
  )
  if (!res.ok) return null
  const commits = await res.json()
  if (!Array.isArray(commits) || commits.length === 0) return null
  const commit = commits[0].commit || {}
  return (commit.committer && commit.committer.date) || (commit.author && commit.author.date) || null
}

function toBase64(bytes) {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function sanitizeName(input) {
  let name = String(input || '')
    .replace(/[\\/]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  name = name.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (!name) return ''
  if (name.length > 120) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : ''
    name = name.slice(0, 120 - ext.length) + ext
  }
  return name
}

function nextFreeName(name, taken) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base} (${i})${ext}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}${ext}`
}

/* --------------------------------------------------------------- routes */

async function handleList(env, cors) {
  const cache = caches.default
  const key = listCacheKey(env)

  const hit = await cache.match(key)
  if (hit) {
    const body = await hit.text()
    return new Response(body, {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-list-cache': 'hit' },
    })
  }

  const entries = (await rawDirEntries(env)).slice(0, MAX_LIST_FILES)
  const files = await Promise.all(
    entries.map(async (entry) => ({
      name: entry.name,
      size: entry.size,
      updatedAt: await lastCommitDate(env, entry.name),
      url: publicUrl(env, entry.name),
    })),
  )
  files.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.name.localeCompare(b.name))

  const body = JSON.stringify({ ok: true, files })
  await cache.put(
    key,
    new Response(body, {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
    }),
  )
  return new Response(body, {
    status: 200,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function handleUpload(request, env, cors) {
  if (!env.GITHUB_TOKEN || !env.UPLOAD_PASSWORD) {
    return json({ ok: false, error: 'not_configured', message: '服务端未配置 GITHUB_TOKEN 或 UPLOAD_PASSWORD' }, 500, cors)
  }

  const password = request.headers.get('x-upload-password') || ''
  if (!(await safeEqual(password, env.UPLOAD_PASSWORD))) {
    return json({ ok: false, error: 'bad_password', message: '访问密码不正确' }, 401, cors)
  }

  const rawName = request.headers.get('x-file-name') || ''
  let decoded = ''
  try {
    decoded = decodeURIComponent(rawName)
  } catch {
    return json({ ok: false, error: 'bad_name', message: '文件名无法解析' }, 400, cors)
  }
  const name = sanitizeName(decoded)
  if (!name) return json({ ok: false, error: 'bad_name', message: '文件名不合法' }, 400, cors)

  const limit = maxBytes(env)
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared && declared > limit) {
    return json({ ok: false, error: 'too_large', message: `文件超过 ${Math.round(limit / 1024 / 1024)} MB` }, 413, cors)
  }

  const buffer = await request.arrayBuffer()
  if (buffer.byteLength === 0) {
    return json({ ok: false, error: 'empty', message: '文件是空的' }, 400, cors)
  }
  if (buffer.byteLength > limit) {
    return json({ ok: false, error: 'too_large', message: `文件超过 ${Math.round(limit / 1024 / 1024)} MB` }, 413, cors)
  }

  const taken = await listNames(env)
  const overwrite = request.headers.get('x-overwrite') === '1'
  let finalName = name
  if (taken.has(name) && !overwrite) finalName = nextFreeName(name, taken)

  const sha = taken.has(finalName) ? await getSha(env, finalName) : null
  const payload = {
    message: `Upload ${finalName}`,
    content: toBase64(new Uint8Array(buffer)),
    branch: env.BRANCH,
  }
  if (sha) payload.sha = sha

  const res = await gh(
    env,
    `/repos/${repoOf(env)}/contents/${encodePath(dirOf(env))}/${encodePath(finalName)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  )

  if (!res.ok) {
    const detail = await res.text()
    return json({ ok: false, error: 'github_error', message: detail.slice(0, 400) }, 502, cors)
  }

  await caches.default.delete(listCacheKey(env))
  return json(
    {
      ok: true,
      file: { name: finalName, size: buffer.byteLength, url: publicUrl(env, finalName) },
      note: 'GitHub Pages 需要约 1 分钟重新构建后，下载链接才会生效',
    },
    200,
    cors,
  )
}

async function handleDelete(request, env, cors) {
  const url = new URL(request.url)
  const password = request.headers.get('x-upload-password') || ''
  if (!(await safeEqual(password, env.UPLOAD_PASSWORD))) {
    return json({ ok: false, error: 'bad_password', message: '访问密码不正确' }, 401, cors)
  }

  const name = sanitizeName(url.searchParams.get('name') || '')
  if (!name) return json({ ok: false, error: 'bad_name', message: '缺少文件名' }, 400, cors)

  const sha = await getSha(env, name)
  if (!sha) return json({ ok: false, error: 'not_found', message: '文件不存在' }, 404, cors)

  const res = await gh(
    env,
    `/repos/${repoOf(env)}/contents/${encodePath(dirOf(env))}/${encodePath(name)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ message: `Delete ${name}`, sha, branch: env.BRANCH }),
    },
  )

  if (!res.ok) {
    const detail = await res.text()
    return json({ ok: false, error: 'github_error', message: detail.slice(0, 400) }, 502, cors)
  }

  await caches.default.delete(listCacheKey(env))
  return json({ ok: true, name }, 200, cors)
}
