import { config } from '../config.js'
import { createTTSProvider } from '../voice/tts.js'
import { loadPersona } from '../vocab/loader.js'
import { AudioPipeline } from './audio-pipeline.js'
import { ScenarioEngine } from './engines/scenario-engine.js'
import { VocabEngine } from './engines/vocab-engine.js'
import { createLLMProvider } from './llm.js'
import { ResponseOrchestrator } from './response/response-orchestrator.js'
import { SessionManager } from './session-manager.js'

export class TutorEngine {
  private llm = createLLMProvider()
  private persona = loadPersona()
  private sessions = new SessionManager()
  private audio = new AudioPipeline(createTTSProvider())
  private scenario = new ScenarioEngine(this.llm, this.sessions, this.audio, this.persona)
  private vocab = new VocabEngine(this.llm)
  private orchestrator = new ResponseOrchestrator(this.llm, this.sessions, this.audio, this.persona)

  async startLesson(
    level: number,
    sessionId: string,
    scenarioId: string,
    voiceDesign?: string,
    stream = false,
    signal?: AbortSignal,
    requestId?: string
  ) {
    return this.scenario.startScenarioLesson(
      scenarioId,
      level,
      sessionId,
      voiceDesign ?? (config.XIAOMI_TTS_VOICE_DESIGN || undefined),
      stream,
      signal,
      requestId
    )
  }

  async handleUserSpeak(
    text: string,
    options: {
      sessionId?: string
      level?: number
      stream?: boolean
      requestId?: string
      signal?: AbortSignal
    } = {}
  ) {
    return this.orchestrator.handleUserSpeak(text, options)
  }

  async explainWord(word: string, sentence?: string) {
    return this.vocab.explainWord(word, sentence)
  }

  getSession(sessionId: string) {
    return this.sessions.getSessionInfo(sessionId)
  }

  getSessionFromCache(sessionId: string) {
    return this.sessions.getFromCache(sessionId)
  }
}

export const tutorEngine = new TutorEngine()
