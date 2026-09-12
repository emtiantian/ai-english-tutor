/** Development-only audio diagnostics. Never log dialogue or audio payloads. */
export function audioDiagnostic(stage: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return
  console.info(
    '[AudioDiag]',
    stage,
    JSON.stringify({
      time: new Date().toISOString(),
      ...details
    })
  )
}
