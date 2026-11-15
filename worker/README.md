# Voiden Files API（Cloudflare Worker）

给 `/files.html` 提供“上传 / 列表 / 删除”接口。文件不会存在 Cloudflare，而是以一次 commit 的形式
写进本仓库的 `files/` 目录，之后由现有的 GitHub Pages 提供下载 —— 所以上传完约 1 分钟后
`https://voiden.cn/files/<文件名>` 才能访问。

```
浏览器 ──POST /upload（带密码）──► Worker ──PUT contents API──► GitHub 仓库 files/
浏览器 ◄──GET /list────────────── Worker ◄──contents + commits API──┘
访客   ──GET https://voiden.cn/files/xxx ─────────────────────────► GitHub Pages
```

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/list` | 公开，返回 `{ ok, files: [{ name, size, updatedAt, url }] }`（60 秒缓存） |
| POST | `/upload` | 需要密码，body 是文件原始字节，文件名放 `X-File-Name`（encodeURIComponent） |
| DELETE | `/file?name=xxx` | 需要密码，删除文件 |

`POST /upload` 请求头：`X-Upload-Password`、`X-File-Name`，可选 `X-Overwrite: 1`（同名覆盖而不是自动改名）。

## 部署（约 5 分钟）

前置：一个 Cloudflare 账号（免费版足够）。Worker 免费额度 10 万次请求/天，本项目用不完。

### 1. 建 GitHub 令牌

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token：

- Repository access：Only select repositories → `CreatiVoiden/creativoiden.github.io`
- Permissions：**Contents → Read and write**，Metadata → Read-only（自动带上）
- 有效期自定，过期后上传会报 `github_error`，重新建一个再 `wrangler secret put` 覆盖即可

> 这个令牌只会以 secret 形式存在 Cloudflare 里，不会进入仓库、不会出现在前端代码中。

### 2. 登录并写入机密

```bash
cd worker
npx wrangler@latest login          # 浏览器里点一下授权
npx wrangler@latest secret put GITHUB_TOKEN     # 粘贴上一步的令牌
npx wrangler@latest secret put UPLOAD_PASSWORD  # 设置上传密码
```

### 3. 发布

```bash
npx wrangler@latest deploy
```

输出里会有一行 `https://voiden-files.<你的子域>.workers.dev`，记下来。

### 4. 把地址填进页面

编辑仓库根的 `js/files.js`，把第一行的常量改成上一步的地址：

```js
const DEFAULT_API = 'https://voiden-files.<你的子域>.workers.dev'
```

然后 `git commit && git push`。临时测试也可以直接在地址栏加参数：
`https://voiden.cn/files.html?api=https://voiden-files.xxx.workers.dev`
（会存进 localStorage，之后不用再带参数）。

## 验证

```bash
curl https://voiden-files.<子域>.workers.dev/health
curl https://voiden-files.<子域>.workers.dev/list
curl -X POST https://voiden-files.<子域>.workers.dev/upload \
     -H "X-Upload-Password: 你的密码" -H "X-File-Name: hello.txt" \
     --data-binary "hello"
```

## 限制与注意

- **单文件 25 MB**（`MAX_FILE_MB` 可改，但别超过 GitHub contents API 的 100 MB，Worker 内存 128 MB 也要留余量）。
- GitHub Pages 站点总量建议 < 1 GB，仓库 > 1 GB 会收到警告 —— 这里适合放课件、PPT、图片这类，不适合当网盘。
- 密码只在 Worker 里校验，前端拿不到密码，也无法绕过；但它只能防“误传”，防不住“知道密码的人删库” —— 真要多人协作再考虑加限流或分账号。
- `files/` 目录里的文件同时也在 git 历史里，删了文件历史仍保留旧版本；彻底清理需要改写历史。
