import { ref } from 'vue'

interface EncodeJob {
  resolve: (blob: Blob) => void
  reject: (err: Error) => void
}

export function useAudioEncoder() {
  const isEncoding = ref(false)
  const error = ref<string | null>(null)
  const jobs = new Map<string, EncodeJob>()
  let idCounter = 0

  const worker = new Worker(
    new URL('../workers/audio-encoder.worker.ts', import.meta.url),
    { type: 'module' },
  )

  worker.onmessage = (
    event: MessageEvent<{ id: string; mp3Chunks?: Uint8Array[]; error?: string }>,
  ) => {
    const { id, mp3Chunks, error: workerError } = event.data
    const job = jobs.get(id)
    if (!job) return

    jobs.delete(id)
    isEncoding.value = jobs.size > 0

    if (workerError) {
      error.value = workerError
      job.reject(new Error(workerError))
    } else if (mp3Chunks) {
      error.value = null
      job.resolve(new Blob(mp3Chunks, { type: 'audio/mp3' }))
    } else {
      const unknownError = 'Unknown worker response'
      error.value = unknownError
      job.reject(new Error(unknownError))
    }
  }

  worker.onerror = (err) => {
    error.value = err.message
    isEncoding.value = false
    for (const [, job] of jobs) {
      job.reject(new Error(err.message))
    }
    jobs.clear()
  }

  async function encode(samples: Float32Array, sampleRate: number): Promise<Blob> {
    const id = `encode-${++idCounter}`
    isEncoding.value = true
    error.value = null

    worker.postMessage({ id, samples, sampleRate }, [samples.buffer])

    return new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject })
    })
  }

  function terminate(): void {
    worker.terminate()
    for (const [, job] of jobs) {
      job.reject(new Error('Encoder terminated'))
    }
    jobs.clear()
    isEncoding.value = false
  }

  return {
    isEncoding,
    error,
    encode,
    terminate,
  }
}
