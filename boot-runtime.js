/**
 * 开机美化 boot runtime.
 *
 * Injected into every rendered boot page. Defines `__BOOT_THEME_RUN__(cfg, opts)`
 * which builds a full-window overlay, plays the configured video (with its own
 * or a separate audio track), then either transitions into the ready app or
 * holds the last frame and fades to the default boot screen.
 *
 * The function stays defined when this boot does not play so the settings panel
 * can reuse it for previews.
 */
;(function () {
  const PLAYED_KEY = 'dsh-boot-theme-played'
  const HOLD_FADE_MS = 1500

  function appReady() {
    const boot = document.querySelector('[data-dsh-boot]')
    if (boot === null) return true
    const root = document.getElementById('root')
    if (root === null) return true
    // The boot screen may stay in the DOM after the app mounts beside it, so a
    // visible sibling of the boot node is the reliable "loaded" signal.
    return Array.from(root.children).some((child) => !child.hasAttribute('data-dsh-boot'))
  }

  function el(tag, style) {
    const node = document.createElement(tag)
    if (style) Object.assign(node.style, style)
    return node
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }

  function animate(durationMs, onFrame) {
    return new Promise((resolve) => {
      if (durationMs <= 0) {
        onFrame(1)
        resolve()
        return
      }
      const started = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - started) / durationMs)
        onFrame(t)
        if (t < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  function fadeVolume(media, from, to, durationMs) {
    return new Promise((resolve) => {
      if (!media) return resolve()
      if (durationMs <= 0) {
        media.volume = Math.max(0, Math.min(1, to))
        resolve()
        return
      }
      const started = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - started) / durationMs)
        media.volume = Math.max(0, Math.min(1, from + (to - from) * t))
        if (t < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  function fadeOut(overlay, durationMs) {
    return new Promise((resolve) => {
      overlay.style.transition = `opacity ${durationMs}ms linear`
      void overlay.offsetWidth
      overlay.style.opacity = '0'
      window.setTimeout(resolve, durationMs + 40)
    })
  }

  function zoomBlurOut(overlay, durationMs) {
    return new Promise((resolve) => {
      overlay.style.transition = `opacity ${durationMs}ms ease, transform ${durationMs}ms ease, filter ${durationMs}ms ease`
      overlay.style.transformOrigin = '50% 50%'
      void overlay.offsetWidth
      overlay.style.transform = 'scale(1.06)'
      overlay.style.filter = 'blur(6px)'
      overlay.style.opacity = '0'
      window.setTimeout(resolve, durationMs + 40)
    })
  }

  async function drawShatter(overlay, video, ms) {
    const width = window.innerWidth
    const height = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const canvas = el('canvas', { position: 'absolute', inset: '0', width: '100%', height: '100%' })
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    overlay.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return fadeOut(overlay, ms)

    const frame = document.createElement('canvas')
    frame.width = canvas.width
    frame.height = canvas.height
    const frameCtx = frame.getContext('2d')
    const vw = video.videoWidth || width
    const vh = video.videoHeight || height
    const scale = Math.max(width / vw, height / vh)
    const drawWidth = vw * scale
    const drawHeight = vh * scale
    try {
      frameCtx.drawImage(
        video,
        ((width - drawWidth) / 2) * dpr,
        ((height - drawHeight) / 2) * dpr,
        drawWidth * dpr,
        drawHeight * dpr,
      )
    } catch {
      canvas.remove()
      return fadeOut(overlay, ms)
    }

    const centerX = width * 0.5
    const centerY = height * 0.44
    const maxRadius = Math.hypot(width, height)
    const count = 28
    const pieces = []
    for (let index = 0; index < count; index += 1) {
      const a0 = (index / count) * Math.PI * 2
      const a1 = ((index + 1) / count) * Math.PI * 2
      const jitter = (Math.random() - 0.5) * 0.05
      const points = [[centerX, centerY]]
      for (let step = 0; step <= 3; step += 1) {
        const angle = a0 + jitter + (a1 - a0) * (step / 3)
        const radius = maxRadius * (0.85 + Math.random() * 0.3)
        points.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius])
      }
      const centroid = points.reduce(
        (acc, point) => [acc[0] + point[0] / points.length, acc[1] + point[1] / points.length],
        [0, 0],
      )
      const middle = (a0 + a1) / 2
      pieces.push({
        points,
        centroid,
        dir: [Math.cos(middle), Math.sin(middle)],
        spin: (Math.random() - 0.5) * 1.4,
        delay: Math.random() * 0.12,
        drift: 60 + Math.random() * 150,
      })
    }

    await animate(720, (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const piece of pieces) {
        const local = Math.max(0, Math.min(1, (t - piece.delay) / (1 - piece.delay)))
        const eased = easeOutCubic(local)
        const alpha = 1 - Math.pow(local, 2.2)
        if (alpha <= 0.01) continue
        const offset = piece.drift * eased
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(
          (piece.centroid[0] + piece.dir[0] * offset) * dpr,
          (piece.centroid[1] + piece.dir[1] * offset + eased * eased * 40) * dpr,
        )
        ctx.rotate(piece.spin * local)
        ctx.translate(-piece.centroid[0] * dpr, -piece.centroid[1] * dpr)
        ctx.beginPath()
        ctx.moveTo(piece.points[0][0] * dpr, piece.points[0][1] * dpr)
        for (let i = 1; i < piece.points.length; i += 1) {
          ctx.lineTo(piece.points[i][0] * dpr, piece.points[i][1] * dpr)
        }
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(frame, 0, 0)
        ctx.restore()
      }
    })

    canvas.remove()
    if (video.parentNode) video.style.visibility = 'hidden'
    await fadeOut(overlay, Math.min(280, Math.max(120, ms / 2)))
  }

  async function runTransition(node, video, cfg, ms) {
    if (cfg.transition === 'zoomBlur') {
      await zoomBlurOut(node, ms)
      return
    }
    if (cfg.transition === 'shatter' && video.videoWidth > 0) {
      await drawShatter(node, video, ms)
      return
    }
    await fadeOut(node, ms)
  }

  function start(cfg, options, done) {
    if (!cfg || !cfg.videoUrl || !document.body) {
      done(false)
      return
    }
    const auto = options.auto === true
    const preview = options.preview === true

    if (auto) {
      if (typeof globalThis.dshDesktopBoot === 'undefined') {
        done(false)
        return
      }
      try {
        if (window.sessionStorage.getItem(PLAYED_KEY) === '1') {
          done(false)
          return
        }
      } catch {
        /* storage may be unavailable */
      }
    }
    if (document.querySelector('[data-boot-theme]')) {
      done(false)
      return
    }

    const overlay = el('div', {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: cfg.background || '#000000',
      opacity: '0',
      display: 'grid',
      placeItems: 'center',
      overflow: 'hidden',
      contain: 'strict',
      cursor: cfg.skipEnabled ? 'pointer' : 'default',
    })
    overlay.setAttribute('data-boot-theme', '')

    const video = el('video', {
      width: '100%',
      height: '100%',
      objectFit: cfg.fit === 'contain' ? 'contain' : 'cover',
      display: 'block',
    })
    video.src = cfg.videoUrl
    video.playsInline = true
    video.preload = 'auto'
    const separateAudio = Boolean(cfg.audioUrl) && cfg.audioEnabled !== false
    video.muted = separateAudio || cfg.audioEnabled === false
    video.volume = Math.max(0, Math.min(1, cfg.volume ?? 0.5))
    overlay.appendChild(video)

    const audio = separateAudio ? new Audio(cfg.audioUrl) : null
    if (audio) {
      audio.preload = 'auto'
      audio.volume = 0
    }

    let finished = false
    let started = false
    let limitTimer = 0
    let safetyTimer = 0
    let lastSpace = 0

    const dispose = () => {
      window.clearTimeout(limitTimer)
      window.clearTimeout(safetyTimer)
      window.removeEventListener('keydown', keyHandler, true)
      overlay.removeEventListener('dblclick', dblClickHandler)
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {
        /* ignore */
      }
      if (audio) {
        try {
          audio.pause()
        } catch {
          /* ignore */
        }
      }
      overlay.remove()
    }

    const finishedNatural = () => {
      if (!auto) return
      try {
        window.sessionStorage.setItem(PLAYED_KEY, '1')
      } catch {
        /* ignore */
      }
      try {
        fetch(cfg.playedEndpoint, { method: 'POST', keepalive: true }).catch(() => {})
      } catch {
        /* ignore */
      }
    }

    const finish = async (reason) => {
      if (finished) return
      finished = true
      window.clearTimeout(limitTimer)
      window.clearTimeout(safetyTimer)

      if (reason === 'error') {
        dispose()
        done(false)
        return
      }

      if (reason !== 'skip' && auto) finishedNatural()

      if (audio) {
        if (reason === 'skip') {
          if (cfg.skipAudio === 'stop') audio.pause()
          else {
            const ms = cfg.skipAudioFadeMs ?? 400
            await fadeVolume(audio, audio.volume, 0, ms)
            audio.pause()
          }
        } else {
          await fadeVolume(audio, audio.volume, 0, Math.min(600, cfg.fadeOutMs ?? 600))
          audio.pause()
        }
      }
      if (video.muted === false) {
        await fadeVolume(video, video.volume, 0, Math.min(600, cfg.fadeOutMs ?? 600))
      }

      if (!preview && !appReady() && reason !== 'skip') {
        await new Promise((resolve) => {
          overlay.style.transition = `opacity ${HOLD_FADE_MS}ms linear`
          void overlay.offsetWidth
          overlay.style.opacity = '0'
          window.setTimeout(resolve, HOLD_FADE_MS + 60)
        })
        dispose()
        done(true)
        return
      }

      const ms = reason === 'skip' ? Math.min(360, Math.max(140, cfg.fadeOutMs ?? 360)) : (cfg.fadeOutMs ?? 800)
      await runTransition(overlay, video, cfg, ms)
      dispose()
      done(true)
    }

    const beginPlayback = () => {
      if (started || finished) return
      started = true
      window.clearTimeout(safetyTimer)
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      const limit =
        cfg.durationMode === 'full'
          ? Math.min(duration || 10, 10)
          : Math.min(duration || (cfg.maxSeconds || 3), cfg.maxSeconds || 3)
      if (limit > 0) limitTimer = window.setTimeout(() => finish('timeout'), Math.round(limit * 1000))
      overlay.style.transition = `opacity ${cfg.fadeInMs ?? 500}ms ease`
      void overlay.offsetWidth
      overlay.style.opacity = '1'
      if (audio) {
        audio.play().catch(() => {})
        fadeVolume(audio, 0, Math.max(0, Math.min(1, cfg.volume ?? 0.5)), cfg.fadeInMs ?? 500)
      }
      video.play().catch(() => finish('error'))
    }

    const keyHandler = (event) => {
      if (finished) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish('skip')
        return
      }
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        const now = performance.now()
        if (now - lastSpace < 600) {
          lastSpace = 0
          finish('skip')
        } else {
          lastSpace = now
        }
      }
    }

    const dblClickHandler = (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      finish('skip')
    }

    if (cfg.skipEnabled) {
      overlay.addEventListener('dblclick', dblClickHandler)
      window.addEventListener('keydown', keyHandler, true)
    }

    video.addEventListener('ended', () => finish('ended'))
    video.addEventListener('error', () => finish('error'))
    video.addEventListener('loadedmetadata', beginPlayback)
    safetyTimer = window.setTimeout(() => {
      if (!started) finish('error')
    }, 6000)

    document.body.appendChild(overlay)
    if (video.readyState >= 1) beginPlayback()
  }

  globalThis.__BOOT_THEME_RUN__ = function (cfg, options) {
    return new Promise((resolve) => {
      try {
        start(cfg || {}, options || {}, (value) => resolve(value))
      } catch (error) {
        console.warn('[boot-theme] runtime failed', error)
        resolve(false)
      }
    })
  }
})()
