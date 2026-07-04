import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { get } from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const targetDir = path.join(repoRoot, 'vendor', 'js-debug-dap')
const serverPath = path.join(targetDir, 'js-debug', 'src', 'dapDebugServer.js')
const requestedTag = process.argv[2] ?? 'latest'

async function main() {
  const release = await fetchJson(releaseApiUrl(requestedTag))
  const asset = release.assets?.find(a => /^js-debug-dap-v.*\.tar\.gz$/.test(a.name))
  if (!asset) {
    throw new Error(`No js-debug-dap tarball found on release ${release.tag_name ?? requestedTag}`)
  }

  const archivePath = path.join(tmpdir(), asset.name)
  console.log(`[js-debug] downloading ${asset.name}`)
  await download(asset.browser_download_url, archivePath)

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })
  execFileSync('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: 'inherit' })

  await stat(serverPath)
  console.log(`[js-debug] installed ${release.tag_name}`)
  console.log(`[js-debug] DAP server: ${serverPath}`)
  console.log('[js-debug] set MINI_VSCODE_JS_DEBUG_DAP to override this path if needed.')
}

function releaseApiUrl(tag) {
  const base = 'https://api.github.com/repos/microsoft/vscode-js-debug/releases'
  return tag === 'latest' ? `${base}/latest` : `${base}/tags/${tag.startsWith('v') ? tag : `v${tag}`}`
}

function fetchJson(url) {
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
