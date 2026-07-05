import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { get } from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

// 这个脚本只负责把微软 js-debug 的 standalone DAP server 下载到本仓库。
//
// 为什么不用 `pnpm add @vscode/js-debug`？
// js-debug 给 VS Code 使用时通常作为扩展/打包产物发布；这里选择 release 里的
// js-debug-dap-v*.tar.gz，是为了直接拿到可运行的 DAP server：
//
//   node vendor/js-debug-dap/js-debug/src/dapDebugServer.js <port>
//
// mini-vscode 自己不实现 Node Inspector/CDP，只连接这个 DAP server。
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const targetDir = path.join(repoRoot, 'vendor', 'js-debug-dap')
const serverPath = path.join(targetDir, 'js-debug', 'src', 'dapDebugServer.js')
// 可传入具体版本，例如：pnpm debug:install-js-debug v1.xx.x；默认 latest。
const requestedTag = process.argv[2] ?? 'latest'

async function main() {
  // 1. 读取 GitHub Release 元数据，找到 js-debug-dap 的 tarball。
  const release = await fetchJson(releaseApiUrl(requestedTag))
  const asset = release.assets?.find(a => /^js-debug-dap-v.*\.tar\.gz$/.test(a.name))
  if (!asset) {
    throw new Error(`No js-debug-dap tarball found on release ${release.tag_name ?? requestedTag}`)
  }

  // 2. 下载到系统临时目录；vendor 里只保留解压后的最终产物。
  const archivePath = path.join(tmpdir(), asset.name)
  console.log(`[js-debug] downloading ${asset.name}`)
  await download(asset.browser_download_url, archivePath)

  // 3. 每次安装都先清空旧版本，避免不同版本文件混在一起。
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })
  execFileSync('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: 'inherit' })

  // 4. 校验关键入口存在。main DebugService 默认会找这个文件。
  await stat(serverPath)
  console.log(`[js-debug] installed ${release.tag_name}`)
  console.log(`[js-debug] DAP server: ${serverPath}`)
  console.log('[js-debug] set MINI_VSCODE_JS_DEBUG_DAP to override this path if needed.')
}

function releaseApiUrl(tag) {
  // GitHub latest 和指定 tag 的 API URL 不一样，这里统一封装一下。
  const base = 'https://api.github.com/repos/microsoft/vscode-js-debug/releases'
  return tag === 'latest' ? `${base}/latest` : `${base}/tags/${tag.startsWith('v') ? tag : `v${tag}`}`
}

function fetchJson(url) {
  // 简单 GET JSON。这里不用引入依赖，保持安装脚本可以独立运行。
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'mini-vscode-js-debug-installer' } }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`GET ${url} failed: ${res.statusCode} ${body}`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
    }).on('error', reject)
  })
}

function download(url, dest) {
  // GitHub release asset 通常会 302 跳转到真实下载地址，所以要处理 redirect。
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'mini-vscode-js-debug-installer' } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`GET ${url} failed: ${res.statusCode}`))
        return
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }).on('error', reject)
  })
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
