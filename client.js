/**
 * 开机美化 — browser half.
 *
 * Adds a "开机美化" tab to the right sidebar. The tab is one panel: media,
 * playback, sound, transition, skip, and preview.
 */
window.__ModuleLoader__.load({
  id: 'dsh-boot-theme',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'boot-theme'
    const TAB_ID = 'dsh-boot-theme'
    const TAB_KIND = 'boot-theme'
    const PRESETS = { high: 0.8, medium: 0.5, low: 0.3 }

    const api = {
      load() {
        return fetch('/boot-theme/state', { headers: { accept: 'application/json' } }).then(checkJson)
      },
      save(settings) {
        return fetch('/boot-theme/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(settings),
        }).then(checkJson)
      },
      pick(kind) {
        return fetch('/boot-theme/pick', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind }),
        }).then(checkJson)
      },
      preview(cfg) {
        const run = globalThis.__BOOT_THEME_RUN__
        if (typeof run !== 'function') return Promise.reject(new Error('启动运行时尚未注入，请刷新页面后重试'))
        return run(cfg, { preview: true })
      },
    }

    function checkJson(response) {
      return response.json().then((body) => {
        if (!response.ok) throw new Error(body && body.error ? body.error : `请求失败 (${response.status})`)
        return body
      })
    }

    function Icon(props) {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', 'aria-hidden': true, ...props },
        h('rect', { x: 2.5, y: 5, width: 19, height: 12, rx: 2.5, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M10 9.2l5 2.8-5 2.8z', fill: 'currentColor' }),
        h('path', { d: 'M6 20h12', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    const COLORS = {
      primary: 'var(--dsw-alias-label-primary, #111)',
      secondary: 'var(--dsw-alias-label-secondary, #555)',
      tertiary: 'var(--dsw-alias-label-tertiary, #888)',
      border: 'var(--dsw-alias-border-l2, rgba(127,127,127,.28))',
      base: 'var(--dsw-alias-bg-base, transparent)',
      brand: 'var(--dsw-alias-brand-primary, #4d8dff)',
    }

    const S = {
      root: {
        height: '100%',
        overflow: 'auto',
        padding: '14px 14px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        color: COLORS.primary,
        fontSize: '13px',
        lineHeight: '1.5',
        boxSizing: 'border-box',
      },
      card: {
        border: `1px solid ${COLORS.border}`,
        borderRadius: '10px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'color-mix(in srgb, currentColor 3%, transparent)',
      },
      title: { fontSize: '13px', fontWeight: 600, margin: 0 },
      row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
      rowLabel: { color: COLORS.secondary, flex: '0 0 auto' },
      control: {
        font: 'inherit',
        color: 'inherit',
        background: COLORS.base,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '7px',
        padding: '4px 7px',
        minWidth: 0,
      },
      path: {
        flex: '1 1 auto',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: COLORS.tertiary,
        fontSize: '12px',
        direction: 'rtl',
        textAlign: 'left',
      },
      button: {
        font: 'inherit',
        color: 'inherit',
        background: COLORS.base,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '8px',
        padding: '5px 10px',
        cursor: 'pointer',
        flex: '0 0 auto',
      },
      primaryButton: {
        font: 'inherit',
        color: '#fff',
        background: COLORS.brand,
        border: '1px solid transparent',
        borderRadius: '8px',
        padding: '6px 14px',
        cursor: 'pointer',
        fontWeight: 600,
      },
      hint: { color: COLORS.tertiary, fontSize: '12px', margin: 0 },
      error: { color: '#e5484d', fontSize: '12px', margin: 0 },
      ok: { color: '#2f9e44', fontSize: '12px', margin: 0 },
      range: { flex: '1 1 auto', accentColor: COLORS.brand },
      number: { width: '64px' },
      preview: {
        width: '100%',
        borderRadius: '8px',
        border: `1px solid ${COLORS.border}`,
        background: '#000',
        maxHeight: '150px',
        objectFit: 'contain',
      },
    }

    function Field(props) {
      return h('label', { style: S.row }, h('span', { style: S.rowLabel }, props.label), props.children)
    }

    function Select(props) {
      return h(
        'select',
        {
          style: { ...S.control, flex: '0 0 auto' },
          value: props.value,
          onChange: (event) => props.onChange(event.target.value),
        },
        props.options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
      )
    }

    function NumberInput(props) {
      return h('input', {
        type: 'number',
        style: { ...S.control, ...S.number },
        value: props.value,
        min: props.min,
        max: props.max,
        step: props.step,
        onChange: (event) => props.onChange(Number(event.target.value)),
      })
    }

    function Panel({ api: client }) {
      const [state, setState] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')

      React.useEffect(() => {
        let cancelled = false
        client
          .load()
          .then((value) => {
            if (cancelled) return
            setState(value)
            setDraft(value.settings)
          })
          .catch((reason) => {
            if (!cancelled) setError(String(reason.message || reason))
          })
        return () => {
          cancelled = true
        }
      }, [])

      const patch = (changes) => setDraft((current) => ({ ...current, ...changes }))

      const save = async () => {
        setBusy('save')
        setError('')
        setNotice('')
        try {
          const result = await client.save(draft)
          setState((current) => ({ ...current, ...result }))
          setDraft(result.settings)
          setNotice('已保存，下次启动生效')
        } catch (reason) {
          setError(String(reason.message || reason))
        } finally {
          setBusy('')
        }
      }

      const pick = async (kind) => {
        setBusy(`pick-${kind}`)
        setError('')
        setNotice('')
        try {
          const result = await client.pick(kind)
          if (result && result.path) {
            patch(kind === 'audio' ? { audioPath: result.path } : { videoPath: result.path })
            setNotice('已选择文件，记得保存')
          }
        } catch (reason) {
          setError(String(reason.message || reason))
        } finally {
          setBusy('')
        }
      }

      const playPreview = async () => {
        setBusy('preview')
        setError('')
        setNotice('')
        try {
          const videoUrl = state && state.media ? state.media.videoUrl : ''
          if (!videoUrl) throw new Error('请先选择视频并保存')
          if (state.settings.videoPath !== draft.videoPath) throw new Error('视频路径已修改，请先保存再试播')
          const cfg = {
            videoUrl,
            audioUrl: draft.audioEnabled && state.media.audioUrl ? state.media.audioUrl : '',
            audioEnabled: draft.audioEnabled,
            volume: volumeOf(draft),
            maxSeconds: draft.maxSeconds,
            durationMode: draft.durationMode,
            fadeInMs: draft.fadeInMs,
            fadeOutMs: draft.fadeOutMs,
            transition: draft.transition,
            skipEnabled: draft.skipEnabled,
            skipAudio: draft.skipAudio,
            skipAudioFadeMs: draft.skipAudioFadeMs,
            background: draft.background,
            fit: draft.fit,
          }
          await client.preview(cfg)
        } catch (reason) {
          setError(String(reason.message || reason))
        } finally {
          setBusy('')
        }
      }

      if (error && !draft) {
        return h('div', { style: S.root }, h('p', { style: S.error }, error))
      }
      if (!draft) {
        return h('div', { style: S.root }, h('p', { style: S.hint }, '读取配置中…'))
      }

      const decision = state ? state.decision : null
      const media = state ? state.media : null

      return h(
        'div',
        { style: S.root },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('h2', { style: S.title }, '开机美化'),
          h(
            'span',
            { style: S.hint },
            draft.enabled ? '已启用' : '已关闭',
          ),
        ),
        h(
          'p',
          { style: S.hint },
          decision && decision.play ? '本次冷启动将播放动画' : `本次不播放：${reasonText(decision && decision.reason)}`,
        ),
        error ? h('p', { style: S.error }, error) : null,
        notice ? h('p', { style: S.ok }, notice) : null,

        h(
          'div',
          { style: S.card },
          h('h3', { style: S.title }, '播放'),
          h(
            Field,
            { label: '总开关' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.enabled,
              onChange: (event) => patch({ enabled: event.target.checked }),
            }),
          ),
          h(Field, {
            label: '播放模式',
            children: h(Select, {
              value: draft.playMode,
              onChange: (value) => patch({ playMode: value }),
              options: [
                { value: 'everyColdStart', label: '每次冷启动' },
                { value: 'dailyFirst', label: '每天首次' },
                { value: 'firstLaunch', label: '仅首次启动' },
              ],
            }),
          }),
          h(Field, {
            label: '时长模式',
            children: h(Select, {
              value: draft.durationMode,
              onChange: (value) => patch({ durationMode: value }),
              options: [
                { value: 'cap', label: '按设定时长截断' },
                { value: 'full', label: '按视频全长（≤10s）' },
              ],
            }),
          }),
          h(
            Field,
            { label: `最长 ${draft.maxSeconds}s` },
            h('input', {
              type: 'range',
              min: 1,
              max: 10,
              step: 1,
              style: S.range,
              value: draft.maxSeconds,
              onChange: (event) => patch({ maxSeconds: Number(event.target.value) }),
            }),
          ),
        ),

        h(
          'div',
          { style: S.card },
          h('h3', { style: S.title }, '视频'),
          h(
            'div',
            { style: S.row },
            h('span', { style: S.path, title: draft.videoPath || '' }, draft.videoPath || '未选择'),
            h(
              'button',
              { style: S.button, disabled: busy === 'pick-video', onClick: () => pick('video') },
              busy === 'pick-video' ? '选择中…' : '选择文件',
            ),
          ),
          media && media.videoExists
            ? h('p', { style: S.hint }, `已选视频 ${(media.videoSize / 1024 / 1024).toFixed(1)} MB`)
            : h('p', { style: S.hint }, '支持 mp4 / webm，建议 1080p、≤30MB'),
        ),

        h(
          'div',
          { style: S.card },
          h('h3', { style: S.title }, '声音'),
          h(
            Field,
            { label: '播放音频' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.audioEnabled,
              onChange: (event) => patch({ audioEnabled: event.target.checked }),
            }),
          ),
          h(
            'div',
            { style: S.row },
            h('span', { style: S.path, title: draft.audioPath || '' }, draft.audioPath || '使用视频自带音轨'),
            h(
              'button',
              { style: S.button, disabled: busy === 'pick-audio', onClick: () => pick('audio') },
              busy === 'pick-audio' ? '选择中…' : '选择音频',
            ),
          ),
          h(Field, {
            label: '音量',
            children: h(Select, {
              value: draft.volumePreset,
              onChange: (value) =>
                patch({ volumePreset: value, ...(PRESETS[value] !== undefined ? { volume: PRESETS[value] } : {}) }),
              options: [
                { value: 'high', label: '高 0.8' },
                { value: 'medium', label: '中 0.5' },
                { value: 'low', label: '低 0.3' },
                { value: 'custom', label: '自定义' },
              ],
            }),
          }),
          draft.volumePreset === 'custom'
            ? h(
                Field,
                { label: `音量 ${Math.round(volumeOf(draft) * 100)}%` },
                h('input', {
                  type: 'range',
                  min: 0,
                  max: 1,
                  step: 0.05,
                  style: S.range,
                  value: volumeOf(draft),
                  onChange: (event) => patch({ volume: Number(event.target.value) }),
                }),
              )
            : null,
          h(
            Field,
            { label: '淡入 / 淡出' },
            h(
              'span',
              { style: { display: 'flex', gap: 6, alignItems: 'center' } },
              h(NumberInput, { value: draft.fadeInMs, min: 0, max: 2000, step: 100, onChange: (v) => patch({ fadeInMs: v }) }),
              h('span', { style: S.hint }, '/'),
              h(NumberInput, { value: draft.fadeOutMs, min: 0, max: 2000, step: 100, onChange: (v) => patch({ fadeOutMs: v }) }),
              h('span', { style: S.hint }, 'ms'),
            ),
          ),
        ),

        h(
          'div',
          { style: S.card },
          h('h3', { style: S.title }, '转场与跳过'),
          h(Field, {
            label: '转场',
            children: h(Select, {
              value: draft.transition,
              onChange: (value) => patch({ transition: value }),
              options: [
                { value: 'fade', label: '淡出' },
                { value: 'zoomBlur', label: '缩放模糊' },
                { value: 'shatter', label: '镜片破碎' },
              ],
            }),
          }),
          h(
            Field,
            { label: '允许跳过' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.skipEnabled,
              onChange: (event) => patch({ skipEnabled: event.target.checked }),
            }),
          ),
          h(
            'p',
            { style: S.hint },
            '跳过手势：左键双击 / 空格连按两次 / Esc；动画开始 300ms 内不响应。',
          ),
          h(Field, {
            label: '跳过时音频',
            children: h(Select, {
              value: draft.skipAudio,
              onChange: (value) => patch({ skipAudio: value }),
              options: [
                { value: 'fade', label: '淡出' },
                { value: 'stop', label: '立即停止' },
                { value: 'custom', label: '自定义' },
              ],
            }),
          }),
          draft.skipAudio !== 'stop'
            ? h(
                Field,
                { label: '跳过淡出' },
                h(NumberInput, {
                  value: draft.skipAudioFadeMs,
                  min: 0,
                  max: 2000,
                  step: 50,
                  onChange: (v) => patch({ skipAudioFadeMs: v }),
                }),
              )
            : null,
        ),

        h(
          'div',
          { style: S.card },
          h('h3', { style: S.title }, '预览'),
          media && media.videoUrl
            ? h('video', {
                key: media.videoUrl,
                src: media.videoUrl,
                style: S.preview,
                controls: true,
                muted: true,
                preload: 'metadata',
              })
            : h('p', { style: S.hint }, '选择并保存视频后可在这里预听预看'),
          h(
            'div',
            { style: { display: 'flex', gap: 8 } },
            h(
              'button',
              { style: S.primaryButton, disabled: busy === 'preview', onClick: playPreview },
              busy === 'preview' ? '试播中…' : '全屏试播',
            ),
            h(
              'button',
              { style: S.button, disabled: busy === 'save', onClick: save },
              busy === 'save' ? '保存中…' : '保存',
            ),
          ),
          h('p', { style: S.hint }, '试播为简化预览；播放模式与「已播放」状态不会因试播改变。'),
        ),
      )
    }

    function volumeOf(draft) {
      if (draft.volumePreset === 'high') return 0.8
      if (draft.volumePreset === 'medium') return 0.5
      if (draft.volumePreset === 'low') return 0.3
      return draft.volume
    }

    function reasonText(reason) {
      switch (reason) {
        case 'disabled':
          return '总开关已关闭'
        case 'no-video':
          return '还没有选择视频'
        case 'video-missing':
          return '视频文件不存在'
        case 'video-type':
          return '视频格式不支持'
        case 'video-too-large':
          return '视频超过 30MB'
        case 'already-played-today':
          return '今天已经播放过'
        case 'first-launch-done':
          return '首次启动动画已播放过'
        default:
          return '没有可播放的配置'
      }
    }

    function definition() {
      return {
        id: TAB_ID,
        kind: TAB_KIND,
        title: () => '开机美化',
        guide: [
          {
            id: 'open',
            order: 40,
            title: () => '开机美化',
            description: () => '启动动画、转场与声音',
            icon: Icon,
          },
        ],
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.inject(['slots', 'sidebarRightTabs'], (inner) => {
          inner.effect(() => inner.sidebarRightTabs.register(definition()), 'boot-theme: tab type')
          inner.effect(
            () =>
              inner.slots.inject('sidebar.right.pane.tab', () =>
                inner.slots.register(
                  {
                    name: 'sidebar.right.pane.tab',
                    key: TAB_ID,
                    inject: () => ({ api }),
                  },
                  Panel,
                ),
              ),
            'boot-theme: panel body',
          )
        })
      },
    }
  },
})
