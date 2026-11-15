/* 文件共享页的前端逻辑：调用 Worker 的 /list、/upload、/file 接口 */

// 部署 Worker 后把地址填在这里（末尾不要带斜杠）
const DEFAULT_API = ''

const MAX_FILE_MB = 25
const API_STORAGE_KEY = 'voiden-files:api'

const API_BASE = (function resolveApi() {
  const fromQuery = new URLSearchParams(location.search).get('api')
  if (fromQuery) {
    try {
      localStorage.setItem(API_STORAGE_KEY, fromQuery)
    } catch (error) {
      /* 隐私模式下写不进去，忽略 */
    }
    return normalize(fromQuery)
  }
  let saved = ''
  try {
    saved = localStorage.getItem(API_STORAGE_KEY) || ''
  } catch (error) {
    saved = ''
  }
  return normalize(saved || DEFAULT_API)
})()

function normalize(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

const el = {
  form: document.getElementById('uploadForm'),
  password: document.getElementById('password'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  pickedName: document.getElementById('pickedName'),
  uploadBtn: document.getElementById('uploadBtn'),
  status: document.getElementById('uploadStatus'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progressBar'),
  list: document.getElementById('fileList'),
  listMeta: document.getElementById('listMeta'),
  refresh: document.getElementById('refreshBtn'),
}

let selectedFile = null
let deleting = false

/* ------------------------------------------------------------- helpers */

function fmtSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB'
  return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function fmtDate(iso) {
  if (!iso) return '时间未知'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间未知'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function extOf(name) {
  const dot = String(name).lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'FILE'
  return name.slice(dot + 1).toUpperCase().slice(0, 4)
}

function setStatus(text, kind) {
  el.status.textContent = text || ''
  el.status.className = 'upload-status' + (kind ? ' is-' + kind : '')
}

function setProgress(ratio) {
  if (ratio === null) {
    el.progress.hidden = true
    el.progressBar.style.width = '0%'
    return
  }
  el.progress.hidden = false
  el.progressBar.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%'
}

/* ------------------------------------------------------------- upload */

function setSelected(file) {
  selectedFile = file || null
  if (selectedFile) {
    el.pickedName.textContent = `${selectedFile.name} · ${fmtSize(selectedFile.size)}`
    el.pickedName.classList.add('is-picked')
    el.dropzone.classList.add('has-file')
  } else {
    el.pickedName.textContent = '未选择文件'
    el.pickedName.classList.remove('is-picked')
    el.dropzone.classList.remove('has-file')
  }
  syncButton()
}

function syncButton() {
  const ready = Boolean(API_BASE) && Boolean(selectedFile) && el.password.value.trim() !== ''
  el.uploadBtn.disabled = !ready
}

function uploadFile(file, password, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', API_BASE + '/upload')
    xhr.setRequestHeader('X-Upload-Password', password)
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    })
    xhr.addEventListener('load', () => {
      let data = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch (error) {
        data = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && data && data.ok) {
        resolve(data)
        return
      }
      const error = new Error((data && data.message) || '上传失败（HTTP ' + xhr.status + '）')
      error.status = xhr.status
      reject(error)
    })
    xhr.addEventListener('error', () => reject(new Error('网络错误，无法连接上传接口')))
    xhr.addEventListener('abort', () => reject(new Error('上传已取消')))
    xhr.send(file)
  })
}

/* --------------------------------------------------------------- list */

async function loadList() {
  if (!API_BASE) {
    el.listMeta.textContent = '上传接口尚未配置'
    el.list.replaceChildren(
      notice(
        '接口未配置：管理员需要先部署 worker/ 里的 Cloudflare Worker，再把地址填进 js/files.js 的 DEFAULT_API。' +
          '临时测试可以在网址后面加 ?api=https://你的worker地址',
      ),
    )
    return
  }

  el.listMeta.textContent = '正在读取…'
  try {
    const res = await fetch(API_BASE + '/list', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data || !data.ok) throw new Error((data && data.message) || 'HTTP ' + res.status)
    renderList(data.files || [])
  } catch (error) {
    el.listMeta.textContent = '读取失败'
    el.list.replaceChildren(notice('无法读取文件列表：' + error.message))
  }
}

function renderList(files) {
  if (!files.length) {
    el.listMeta.textContent = '还没有任何文件'
    el.list.replaceChildren(notice('这里还空着 —— 上传第一个文件试试。'))
    return
  }
  let total = 0
  files.forEach((file) => {
    total += Number(file.size) || 0
  })
  el.listMeta.textContent = `共 ${files.length} 个文件，合计 ${fmtSize(total)}`

  const rows = files.map((file) => {
    const row = document.createElement('div')
    row.className = 'file-row'

    const icon = document.createElement('span')
    icon.className = 'file-ext'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = extOf(file.name)

    const main = document.createElement('div')
    main.className = 'file-main'
    const link = document.createElement('a')
    link.className = 'file-name'
    link.href = file.url
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = file.name
    const meta = document.createElement('span')
    meta.className = 'file-meta'
    meta.textContent = fmtSize(file.size) + ' · ' + fmtDate(file.updatedAt)
    main.append(link, meta)

    const actions = document.createElement('div')
    actions.className = 'file-actions'

    const download = document.createElement('a')
    download.className = 'btn btn-ghost btn-sm'
    download.href = file.url
    download.setAttribute('download', '')
    download.textContent = '下载'

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'btn btn-ghost btn-sm'
    copy.textContent = '复制链接'
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(file.url)
        copy.textContent = '已复制'
      } catch (error) {
        copy.textContent = '复制失败'
      }
      setTimeout(() => {
        copy.textContent = '复制链接'
      }, 1500)
    })

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'btn btn-ghost btn-sm btn-danger'
    remove.textContent = '删除'
    remove.addEventListener('click', () => onDelete(file, remove))

    actions.append(download, copy, remove)
    row.append(icon, main, actions)
    return row
  })

  el.list.replaceChildren(...rows)
}

function notice(text) {
  const box = document.createElement('p')
  box.className = 'file-empty'
  box.textContent = text
  return box
}

async function onDelete(file, button) {
  if (deleting) return
  const password = el.password.value.trim()
  if (!password) {
    setStatus('删除需要先在上面填写访问密码', 'warn')
    el.password.focus()
    return
  }
  if (!window.confirm(`确定删除「${file.name}」？这个操作会从仓库里移除该文件。`)) return

  deleting = true
  button.disabled = true
  button.textContent = '删除中…'
  try {
    const res = await fetch(API_BASE + '/file?name=' + encodeURIComponent(file.name), {
      method: 'DELETE',
      headers: { 'X-Upload-Password': password },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data || !data.ok) throw new Error((data && data.message) || 'HTTP ' + res.status)
    setStatus('已删除「' + file.name + '」', 'ok')
    await loadList()
  } catch (error) {
    setStatus('删除失败：' + error.message, 'error')
    button.disabled = false
    button.textContent = '删除'
  } finally {
    deleting = false
  }
}

/* ------------------------------------------------------------- events */

function pickFile(files) {
  const file = files && files[0]
  if (!file) return
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    setSelected(null)
    setStatus(`文件 ${fmtSize(file.size)} 超过 ${MAX_FILE_MB} MB 上限`, 'error')
    return
  }
  setStatus('')
  setSelected(file)
}

el.dropzone.addEventListener('click', () => el.fileInput.click())
el.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    el.fileInput.click()
  }
})
el.fileInput.addEventListener('change', () => pickFile(el.fileInput.files))

;['dragenter', 'dragover'].forEach((type) => {
  el.dropzone.addEventListener(type, (event) => {
    event.preventDefault()
    el.dropzone.classList.add('is-over')
  })
})
;['dragleave', 'dragend'].forEach((type) => {
  el.dropzone.addEventListener(type, (event) => {
    event.preventDefault()
    el.dropzone.classList.remove('is-over')
  })
})
el.dropzone.addEventListener('drop', (event) => {
  event.preventDefault()
  el.dropzone.classList.remove('is-over')
  pickFile(event.dataTransfer && event.dataTransfer.files)
})

el.password.addEventListener('input', syncButton)

el.form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!API_BASE) {
    setStatus('上传接口尚未配置', 'error')
    return
  }
  if (!selectedFile) {
    setStatus('请先选择文件', 'warn')
    return
  }
  const password = el.password.value.trim()
  if (!password) {
    setStatus('请输入访问密码', 'warn')
    el.password.focus()
    return
  }

  el.uploadBtn.disabled = true
  el.uploadBtn.textContent = '上传中…'
  setStatus('正在上传 ' + selectedFile.name, '')
  setProgress(0)

  try {
    const data = await uploadFile(selectedFile, password, setProgress)
    const saved = data.file || {}
    setProgress(1)
    setStatus(`上传成功：${saved.name}（约 1 分钟后可通过链接下载）`, 'ok')
    setSelected(null)
    el.fileInput.value = ''
    await loadList()
  } catch (error) {
    if (error.status === 401) setStatus('访问密码不正确', 'error')
    else if (error.status === 413) setStatus(error.message, 'error')
    else setStatus('上传失败：' + error.message, 'error')
    setProgress(null)
  } finally {
    el.uploadBtn.textContent = '开始上传'
    syncButton()
  }
})

el.refresh.addEventListener('click', () => {
  el.refresh.disabled = true
  loadList().finally(() => {
    el.refresh.disabled = false
  })
})

if (!API_BASE) {
  el.uploadBtn.disabled = true
  setStatus('上传接口尚未配置，暂时只能浏览', 'warn')
}

syncButton()
loadList()
