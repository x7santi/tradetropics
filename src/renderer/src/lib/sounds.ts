import { useSettingsStore } from '@renderer/store/settingsStore'

function getCtx(): AudioContext {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  ctx.resume()
  return ctx
}

// Soft click played when sounds are toggled ON — does NOT check soundsEnabled
export function playToggleOn(): void {
  try {
    const ctx = getCtx()
    const t   = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1100, t)
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.06)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.12)
  } catch (err) {
    console.debug('[Sound] Toggle click failed:', err)
  }
}

// Short ascending three-note chime (C-E-G) — for creating a report
export function playTypewriterKey(): void {
  try {
    const { soundsEnabled } = useSettingsStore.getState()
    if (!soundsEnabled) return

    const ctx = getCtx()
    const t   = ctx.currentTime

    // C5 → E5 → G5, staggered 65ms apart
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((freq, i) => {
      const onset = t + i * 0.065

      // Fundamental — bell body
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq

      // 4th partial — gives marimba/bell overtone character
      const osc2 = ctx.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = freq * 4.0

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.001, onset)
      gain.gain.linearRampToValueAtTime(0.28, onset + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.001, onset + 0.38)

      const gain2 = ctx.createGain()
      gain2.gain.setValueAtTime(0.001, onset)
      gain2.gain.linearRampToValueAtTime(0.09, onset + 0.005)
      gain2.gain.exponentialRampToValueAtTime(0.001, onset + 0.07)

      osc.connect(gain);   gain.connect(ctx.destination)
      osc2.connect(gain2); gain2.connect(ctx.destination)

      osc.start(onset);  osc.stop(onset + 0.4)
      osc2.start(onset); osc2.stop(onset + 0.1)
    })
  } catch (err) {
    console.debug('[Sound] Report chime failed:', err)
  }
}

// Generate and play a metal clank sound using Web Audio API
export function playMetalClank(): void {
  try {
    const { soundsEnabled } = useSettingsStore.getState()
    if (!soundsEnabled) return

    const audioContext = getCtx()
    const now = audioContext.currentTime
    const duration = 0.15

    const gainNode = audioContext.createGain()
    gainNode.gain.setValueAtTime(0.3, now)
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration)
    gainNode.connect(audioContext.destination)

    const osc = audioContext.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(200, now + duration * 0.6)
    osc.connect(gainNode)
    osc.start(now)
    osc.stop(now + duration)

    const osc2 = audioContext.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1600, now)
    osc2.frequency.exponentialRampToValueAtTime(400, now + duration * 0.4)
    osc2.connect(gainNode)
    osc2.start(now)
    osc2.stop(now + duration * 0.5)
  } catch (err) {
    console.debug('[Sound] Metal clank failed:', err)
  }
}

// Generate and play a paper scrunch/rip sound using Web Audio API — for deleting
export function playPaperScrunch(): void {
  try {
    const { soundsEnabled } = useSettingsStore.getState()
    if (!soundsEnabled) return

    const audioContext = getCtx()
    const now = audioContext.currentTime
    const duration = 0.3

    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate)
    const channelData = buffer.getChannelData(0)
    for (let i = 0; i < buffer.length; i++) {
      channelData[i] = Math.random() * 2 - 1
    }

    const noiseSource = audioContext.createBufferSource()
    noiseSource.buffer = buffer

    const gainNode = audioContext.createGain()
    gainNode.gain.setValueAtTime(0.25, now)
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration)

    const filter = audioContext.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(2000, now)
    filter.frequency.exponentialRampToValueAtTime(4000, now + duration * 0.4)

    noiseSource.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(audioContext.destination)

    noiseSource.start(now)
    noiseSource.stop(now + duration)
  } catch (err) {
    console.debug('[Sound] Paper scrunch failed:', err)
  }
}
