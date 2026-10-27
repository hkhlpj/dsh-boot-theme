/**
 * dsh-boot-theme — host half of 开机美化.
 *
 * Owns the persisted settings, the media routes the boot overlay and the panel
 * stream from, the native file picker, and the index injection that installs the
 * boot runtime into every cold-start page.
 */
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-boot-theme'
export const inject = ['webServer']

const ROUTE_BASE = '/boot-theme'
const MAX_BYTES = 30 * 1024 * 1024
const MAX_SECONDS = 10
const VIDEO_EXT = new Set(['.mp4', '.webm'])
const AUDIO_EXT = new Set(['.mp3', '.aac', '.m4a', '.wav', '.ogg', '.flac'])

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
}

const DEFAULTS = {
  enabled: true,
  playMode: 'dailyFirst',
  maxSeconds: 3,
  durationMode: 'cap',
  videoPath: '',
  audioPath: '',
  audioEnabled: true,
  volumePreset: 'medium',
  volume: 0.5,
  fadeInMs: 500,
  fadeOutMs: 800,
  transition: 'fade',
  skipEnabled: true,
  skipAudio: 'fade',
  skipAudioFadeMs: 400,
  background: '#000000',
  fit: 'cover',
  lastPlayedDay: '',
  firstLaunchDone: false,
}

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function settingsDir() {
  return join(dshHome(), 'storage', 'boot-theme')
}

function settingsFile() {
  return join(settingsDir(), 'settings.json')
}

function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function pickString(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

function normPath(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function localDay() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const preset = pickString(source.volumePreset, ['high', 'medium', 'low', 'custom'], DEFAULTS.volumePreset)
  const presetVolume = preset === 'high' ? 0.8 : preset === 'medium' ? 0.5 : preset === 'low' ? 0.3 : undefined
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULTS.enabled,
    playMode: pickString(source.playMode, ['everyColdStart', 'dailyFirst', 'firstLaunch'], DEFAULTS.playMode),
    maxSeconds: Math.round(clampNumber(source.maxSeconds, 1, MAX_SECONDS, DEFAULTS.maxSeconds)),
    durationMode: pickString(source.durationMode, ['cap', 'full'], DEFAULTS.durationMode),
    videoPath: normPath(source.videoPath),
    audioPath: normPath(source.audioPath),
    audioEnabled: typeof source.audioEnabled === 'boolean' ? source.audioEnabled : DEFAULTS.audioEnabled,
    volumePreset: preset,
    volume: clampNumber(source.volume, 0, 1, presetVolume ?? DEFAULTS.volume),
    fadeInMs: Math.round(clampNumber(source.fadeInMs, 0, 2000, DEFAULTS.fadeInMs)),
    fadeOutMs: Math.round(clampNumber(source.fadeOutMs, 0, 2000, DEFAULTS.fadeOutMs)),
    transition: pickString(source.transition, ['fade', 'zoomBlur', 'shatter'], DEFAULTS.transition),
    skipEnabled: typeof source.skipEnabled === 'boolean' ? source.skipEnabled : DEFAULTS.skipEnabled,
    skipAudio: pickString(source.skipAudio, ['fade', 'stop', 'custom'], DEFAULTS.skipAudio),
    skipAudioFadeMs: Math.round(clampNumber(source.skipAudioFadeMs, 0, 2000, DEFAULTS.skipAudioFadeMs)),
    background: typeof source.background === 'string' && /^#[0-9a-f]{6}$/i.test(source.background)
      ? source.background
      : DEFAULTS.background,
    fit: pickString(source.fit, ['cover', 'contain'], DEFAULTS.fit),
    lastPlayedDay: typeof source.lastPlayedDay === 'string' ? source.lastPlayedDay : '',
    firstLaunchDone: source.firstLaunchDone === true,
  }
}

async function readSettings() {
  try {
    const text = await readFile(settingsFile(), 'utf8')
    return normalizeSettings(JSON.parse(text))
  } catch {
    return normalizeSettings({})
  }
}

async function writeSettings(settings) {
  await mkdir(settingsDir(), { recursive: true })
  const target = settingsFile()
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

function fileFacts(path) {
  if (!path) return { exists: false, size: 0, mtimeMs: 0 }
  try {
    const info = statSync(path)
    return { exists: info.isFile(), size: info.size, mtimeMs: info.mtimeMs }
  } catch {
    return { exists: false, size: 0, mtimeMs: 0 }
  }
}

function mediaKindFor(path) {
  const type = extname(path).toLowerCase()
  if (VIDEO_EXT.has(type)) return 'video'
  if (AUDIO_EXT.has(type)) return 'audio'
  return ''
}

function shouldPlayNow(settings) {
  if (!settings.enabled) return { play: false, reason: 'disabled' }
  if (!settings.videoPath) return { play: false, reason: 'no-video' }
  const facts = fileFacts(settings.videoPath)
  if (!facts.exists) return { play: false, reason: 'video-missing' }
  if (mediaKindFor(settings.videoPath) !== 'video') return { play: false, reason: 'video-type' }
  if (facts.size > MAX_BYTES) return { play: false, reason: 'video-too-large' }
  if (settings.playMode === 'dailyFirst' && settings.lastPlayedDay === localDay()) {
    return { play: false, reason: 'already-played-today' }
  }
  if (settings.playMode === 'firstLaunch' && settings.firstLaunchDone) {
    return { play: false, reason: 'first-launch-done' }
  }
  return { play: true, reason: 'ok' }
}

function mediaUrl(kind, path) {
  const facts = fileFacts(path)
  if (!facts.exists) return ''
  return `${ROUTE_BASE}/media?kind=${kind}&v=${Math.round(facts.mtimeMs)}`
}

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function streamMedia(req, res, path) {
  const facts = fileFacts(path)
  if (!facts.exists) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
    return
  }
  const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range
  const baseHeaders = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  }
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match) {
      const start = match[1] === '' ? 0 : Number(match[1])
      const end = match[2] === '' ? facts.size - 1 : Math.min(Number(match[2]), facts.size - 1)
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        res.writeHead(206, {
          ...baseHeaders,
          'content-range': `bytes ${start}-${end}/${facts.size}`,
          'content-length': end - start + 1,
        })
        createReadStream(path, { start, end }).pipe(res)
        return
      }
      res.writeHead(416, { 'content-range': `bytes */${facts.size}` })
      res.end()
      return
    }
  }
  res.writeHead(200, { ...baseHeaders, 'content-length': facts.size })
  createReadStream(path).pipe(res)
}

function fileFilter(kind) {
  return kind === 'audio'
    ? '音频文件|*.mp3;*.aac;*.m4a;*.wav;*.ogg;*.flac|所有文件|*.*'
    : '视频文件|*.mp4;*.webm|所有文件|*.*'
}

function pickDialog(kind) {
  return new Promise((resolvePromise) => {
    const out = join(settingsDir(), `.pick-${Date.now()}.txt`)
    mkdir(settingsDir(), { recursive: true }).catch(() => {})
    const script = [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      "$dialog.Title = '选择开机动画文件'",
      '$dialog.Filter = $env:DSH_BOOT_THEME_FILTER',
      '$dialog.CheckFileExists = $true',
      "$dialog.RestoreDirectory = $true",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
      '  Set-Content -LiteralPath $env:DSH_BOOT_THEME_OUT -Value $dialog.FileName -Encoding UTF8',
      '}',
    ].join('\r\n')
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
      stdio: 'ignore',
      windowsHide: false,
      env: {
        ...process.env,
        DSH_BOOT_THEME_FILTER: fileFilter(kind),
        DSH_BOOT_THEME_OUT: out,
      },
    })
    const timer = setTimeout(() => {
      child.kill()
      resolvePromise('')
    }, 180000)
    child.on('error', () => {
      clearTimeout(timer)
      resolvePromise('')
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const value = readFileSyncSafe(out)
        resolvePromise(value)
      } catch {
        resolvePromise('')
      }
    })
  })
}

function readFileSyncSafe(path) {
  return readFileSync(path, 'utf8').trim()
}

function buildBootConfig(settings, decision) {
  const videoUrl = mediaUrl('video', settings.videoPath)
  const audioUrl = settings.audioPath ? mediaUrl('audio', settings.audioPath) : ''
  return {
    play: decision.play,
    reason: decision.reason,
    videoUrl,
    audioUrl,
    audioEnabled: settings.audioEnabled,
    volume: settings.volume,
    maxSeconds: settings.maxSeconds,
    durationMode: settings.durationMode,
    fadeInMs: settings.fadeInMs,
    fadeOutMs: settings.fadeOutMs,
    transition: settings.transition,
    skipEnabled: settings.skipEnabled,
    skipAudio: settings.skipAudio,
    skipAudioFadeMs: settings.skipAudioFadeMs,
    background: settings.background,
    fit: settings.fit,
    playedEndpoint: `${ROUTE_BASE}/played`,
    preview: false,
  }
}

export async function apply(ctx, config) {
  const log = (level, message) => {
    try {
      const logger = typeof ctx?.logger === 'function' ? ctx.logger('boot-theme') : ctx?.logger
      if (logger && typeof logger[level] === 'function') logger[level](message)
      else console.warn(`[boot-theme] ${message}`)
    } catch {
      /* logging must not break activation */
    }
  }

  const runtimeSource = (() => {
    try {
      return readFileSyncSafe(fileURLToPath(new URL('./boot-runtime.js', import.meta.url)))
    } catch (error) {
      log('warn', `runtime source unreadable: ${String(error)}`)
      return ''
    }
  })()

  const webServer = ctx.webServer
  if (!webServer) {
    log('warn', 'webServer service unavailable; 开机美化 disabled')
    return
  }

  let settings = normalizeSettings({})
  let loaded = false
  const ready = readSettings().then((value) => {
    settings = value
    loaded = true
  })
  await ready

  const route = (kind, path, handler) =>
    ctx.effect(() => webServer.register({ kind: 'exact', path, handler }), `boot-theme: ${path}`)

  route('exact', `${ROUTE_BASE}/state`, async (req, res) => {
    await ready
    const decision = shouldPlayNow(settings)
    const videoFacts = fileFacts(settings.videoPath)
    const audioFacts = fileFacts(settings.audioPath)
    json(res, 200, {
      settings,
      today: localDay(),
      decision,
      media: {
        videoUrl: mediaUrl('video', settings.videoPath),
        audioUrl: settings.audioPath ? mediaUrl('audio', settings.audioPath) : '',
        videoExists: videoFacts.exists,
        videoSize: videoFacts.size,
        audioExists: audioFacts.exists,
        audioSize: audioFacts.size,
      },
      limits: { maxBytes: MAX_BYTES, maxSeconds: MAX_SECONDS },
      videoExt: [...VIDEO_EXT],
      audioExt: [...AUDIO_EXT],
    })
  })

  route('exact', `${ROUTE_BASE}/settings`, async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    await ready
    try {
      const body = await readBody(req)
      const next = normalizeSettings({ ...settings, ...body, lastPlayedDay: settings.lastPlayedDay, firstLaunchDone: settings.firstLaunchDone })
      if (next.videoPath) {
        if (!existsSync(next.videoPath)) throw new Error('视频文件不存在')
        if (mediaKindFor(next.videoPath) !== 'video') throw new Error('视频仅支持 mp4 / webm')
        const facts = statSync(next.videoPath)
        if (facts.size > MAX_BYTES) throw new Error('视频超过 30MB 上限')
      }
      if (next.audioPath) {
        if (!existsSync(next.audioPath)) throw new Error('音频文件不存在')
        if (mediaKindFor(next.audioPath) !== 'audio') throw new Error('音频仅支持 mp3 / aac / m4a / wav / ogg / flac')
      }
      settings = next
      await writeSettings(settings)
      const decision = shouldPlayNow(settings)
      json(res, 200, {
        settings,
        decision,
        media: {
          videoUrl: mediaUrl('video', settings.videoPath),
          audioUrl: settings.audioPath ? mediaUrl('audio', settings.audioPath) : '',
        },
      })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  route('exact', `${ROUTE_BASE}/media`, async (req, res) => {
    await ready
    const url = new URL(req.url ?? '/', 'http://localhost')
    const kind = url.searchParams.get('kind') === 'audio' ? 'audio' : 'video'
    const path = kind === 'audio' ? settings.audioPath : settings.videoPath
    if (!path) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('no media')
      return
    }
    streamMedia(req, res, path)
  })

  route('exact', `${ROUTE_BASE}/pick`, async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    await ready
    try {
      const body = await readBody(req)
      const kind = body?.kind === 'audio' ? 'audio' : 'video'
      const path = await pickDialog(kind)
      json(res, 200, { kind, path })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  route('exact', `${ROUTE_BASE}/played`, async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' })
      return
    }
    await ready
    try {
      settings = {
        ...settings,
        lastPlayedDay: localDay(),
        firstLaunchDone: true,
      }
      await writeSettings(settings)
      json(res, 200, { ok: true })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  // Install the runtime into every rendered boot page. The function stays
  // defined even when this boot does not play, so the panel can preview it.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.on('webserver/index-inject', (table) => {
      if (!loaded || runtimeSource === '') return
      const payload = buildBootConfig(settings, shouldPlayNow(settings))
      const text =
        `globalThis.__BOOT_THEME_CFG__=${JSON.stringify(payload)};\n${runtimeSource}\n` +
        `globalThis.__BOOT_THEME_RUN__ && globalThis.__BOOT_THEME_CFG__.play && globalThis.__BOOT_THEME_RUN__(globalThis.__BOOT_THEME_CFG__,{auto:true});`
      table.push({ kind: 'script', placement: 'body', text: text.replaceAll('</script', '<\\/script') })
    })
  })

  ctx.effect(() => {
    log('info', `ready (${settingsFile()})`)
  }, 'boot-theme: startup log')
}
