// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioRecorder } from '../recorder'

describe('AudioRecorder', () => {
  let recorder: AudioRecorder
  let mockMediaRecorder: any
  let mockStream: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      state: 'inactive',
      mimeType: 'audio/webm',
      ondataavailable: null as any,
      onstop: null as any
    }

    mockStream = {
      getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }])
    }

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream)
      },
      writable: true
    })

    global.MediaRecorder = vi.fn(function () {
      mockMediaRecorder.state = 'recording'
      return mockMediaRecorder
    }) as any
    global.MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true)

    global.AudioContext = vi.fn(function () {
      const ctx: any = {}
      ctx.createMediaStreamSource = vi.fn().mockReturnValue({
        connect: vi.fn(),
        context: ctx
      })
      ctx.createAnalyser = vi.fn().mockReturnValue({
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn()
      })
      ctx.close = vi.fn()
      return ctx
    }) as any

    recorder = new AudioRecorder()
  })

  describe('start', () => {
    it('should request microphone permission', async () => {
      await recorder.start()
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })
    })

    it('should create MediaRecorder with correct mimeType', async () => {
      await recorder.start()
      expect(MediaRecorder).toHaveBeenCalledWith(mockStream, {
        mimeType: 'audio/webm;codecs=opus'
      })
    })

    it('should set isRecording to true', async () => {
      expect(recorder.isRecording).toBe(false)
      await recorder.start()
      expect(recorder.isRecording).toBe(true)
    })
  })

  describe('stop', () => {
    it('should return audio blob', async () => {
      await recorder.start()

      const stopPromise = recorder.stop()

      const blob = new Blob(['audio-data'], { type: 'audio/webm' })
      mockMediaRecorder.ondataavailable({ data: blob })
      mockMediaRecorder.onstop()

      const result = await stopPromise

      expect(result.blob).toBeInstanceOf(Blob)
      expect(result.mimeType).toBe('audio/webm')
    })
  })

  describe('cancel', () => {
    it('should stop without returning data', async () => {
      await recorder.start()
      recorder.cancel()
      expect(mockMediaRecorder.stop).toHaveBeenCalled()
      // 在 onstop 触发前 isRecording 保持为 true（异步）
      expect(recorder.isRecording).toBe(true)

      // 模拟异步 onstop 事件
      mockMediaRecorder.onstop()
      expect(recorder.isRecording).toBe(false)
    })

    it('should reject pending stop() when cancel() is called', async () => {
      await recorder.start()

      const stopPromise = recorder.stop()
      recorder.cancel()

      await expect(stopPromise).rejects.toThrow('Recording cancelled')
    })

    it('should be safe to call cancel() twice', async () => {
      await recorder.start()
      recorder.cancel()
      // 不应抛错
      expect(() => recorder.cancel()).not.toThrow()
      // 模拟第一次 cancel 产生的异步 onstop 事件
      mockMediaRecorder.onstop()
      expect(recorder.isRecording).toBe(false)
    })

    it('should be safe to call cancel() when never started', () => {
      // 不应抛错
      expect(() => recorder.cancel()).not.toThrow()
      expect(recorder.isRecording).toBe(false)
    })
  })
})
