/**
 * 场景化教学引擎：基于具体场景（餐厅、购物等）启动和推进角色扮演。
 */
import { logger } from '../../logger.js'
import type { CEFRLevel, CharacterPersona, OpeningStyle } from '@ai-english-tutor/shared'
import { getScenarioProfile, getScenarioActs } from '@ai-english-tutor/shared'
import type { LLMProvider } from '../llm.js'
import type { AudioPipeline } from '../audio-pipeline.js'
import { SessionManager, type SessionData, type ScenarioState } from '../session-manager.js'
import { VocabTracker } from '../vocab-tracker.js'
import { getScenarioById, type Scenario } from '../../vocab/loader.js'
import { buildScenarioStartMessages, pickOpeningStyle } from '../prompts/teaching.js'
import { parseTeachingResponse } from '../response-parser.js'
import { warnIfMissingVocabSentences } from '../response/response-orchestrator.js'
import { pickScenarioVocabulary, DEFAULT_TARGET_COUNT } from '../scenario-vocab-picker.js'
import { lineGroupKey, getReusableLines, recordTeacherLine } from '../line-pool.js'
import { levelNumToCEFR } from '../utils/cefr.js'
import { DEFAULT_MAX_TURNS } from '../utils/scenario-progress.js'

export class ScenarioEngine {
  constructor(
    private llm: LLMProvider,
    private sessions: SessionManager,
    private audio: AudioPipeline,
    private vocabTracker: VocabTracker,
    private persona: CharacterPersona,
  ) {}

  async startScenarioLesson(
    scenarioId: string,
    level: number,
    sessionId: string,
    userId?: string,
    style?: OpeningStyle,
    targetLevel?: CEFRLevel,
    resumeFrom?: string,
  ) {
    const scenario = getScenarioById(scenarioId)
    if (!scenario) {
      throw new Error(`场景不存在：${scenarioId}`)
    }

    logger.info({ sessionId, scenarioId: scenario.id, scenarioName: scenario.name, targetLevel, resumeFrom }, '开始场景化课程')

    // v2: 确定 CEFR 目标等级
    const cefrLevel = targetLevel ?? levelNumToCEFR(level)

    let scenarioState: ScenarioState
    let isResume = false

    // v2: 若提供了 resumeFrom，则从已有服务端会话恢复
    if (resumeFrom) {
      const existing = this.sessions.getOrCreate(resumeFrom, level)
      if (existing.scenario) {
        scenarioState = existing.scenario
        isResume = true
        logger.info({ sessionId, resumeFrom, scenarioId: scenarioState.id }, '恢复场景会话')
      } else {
        logger.warn({ sessionId, resumeFrom }, '未找到可恢复的场景状态，重新开始')
        scenarioState = this.createScenarioState(scenario, cefrLevel)
      }
      // 确保当前 sessionId 指向同一份会话数据
      this.sessions.set(sessionId, this.sessions.getOrCreate(resumeFrom, level))
    } else {
      scenarioState = this.createScenarioState(scenario, cefrLevel)
    }

    // 提前确定风格，使可复用台词组（按音色分组）与 buildScenarioStartMessages 实际使用的音色一致。
    const resolvedStyle = style ?? pickOpeningStyle(this.persona)
    const lineGroup = lineGroupKey(scenario.id, cefrLevel, resolvedStyle.voiceDesign)
    const reusableLines = await getReusableLines(lineGroup)

    const { messages: startMessages, style: chosenStyle } = buildScenarioStartMessages(scenario, level, cefrLevel, resolvedStyle, this.persona, reusableLines, scenarioState.targetWords, scenarioState.levelProfile)

    const session = this.sessions.getOrCreate(sessionId, level)
    session.userId = userId
    session.openingStyle = chosenStyle
    session.voiceDesign = chosenStyle.voiceDesign
    session.scenario = scenarioState

    this.sessions.saveSessionToDb(sessionId, level, chosenStyle.name, chosenStyle.voiceDesign)
    this.sessions.saveScenarioState(sessionId, scenarioState)

    // 生成开场/恢复问候
    const userPrompt = isResume
      ? `The student is returning to the role-play scenario: "${scenario.nameEn}". ` +
        `Welcome them back naturally and continue the conversation as ${scenario.role.teacher}. ` +
        `Current progress: ${scenarioState.turnsCount} turns, ${scenarioState.wordsUsed.size}/${scenarioState.targetWords.length} target words used. ` +
        `Do NOT explain the objectives — just continue in character.`
      : `The student is starting a role-play scenario: "${scenario.nameEn}". ` +
        `Setting: ${scenario.setting} ` +
        `Begin the scenario naturally. Introduce the setting and your role in character. ` +
        `Do NOT explain the objectives — just start the conversation as if it's really happening.`

    const messages = [
      { role: 'system' as const, content: startMessages[0].content },
      { role: 'user' as const, content: userPrompt },
    ]

    const response = await this.llm.complete(messages)
    const parsed = parseTeachingResponse(response.content)
    warnIfMissingVocabSentences(parsed, sessionId, isResume ? 'resumeScenarioLesson' : 'startScenarioLesson')

    this.sessions.addMessage(sessionId, session, 'assistant', parsed.text, {
      motionId: parsed.motionId,
      expressionId: parsed.expressionId,
      vocabulary: parsed.vocabulary,
      vocabularySentences: parsed.vocabularySentences,
    })

    // 记住这句台词，便于后续复用（并命中 TTS 缓存）。
    await recordTeacherLine(lineGroup, parsed.text)

    // 跟踪词汇
    if (userId && parsed.vocabulary?.length) {
      const levelStr = cefrLevel
      this.vocabTracker.processTurn(
        userId, '', parsed.vocabulary, [], levelStr,
      )
    }

    const audioResult = await this.audio.handleOutput(parsed.text, session.voiceDesign, sessionId)

    return {
      ...parsed,
      audioBase64: audioResult.audioBase64,
      scenario: this.buildScenarioResponse(scenarioState),
    }
  }

  /**
   * v2: 创建新的 ScenarioState，目标词汇根据 CEFR 等级筛选。
   */
  private createScenarioState(scenario: Scenario, level: CEFRLevel): ScenarioState {
    const profile = getScenarioProfile(scenario, level)
    const targetCount = profile?.targetWordCount ?? DEFAULT_TARGET_COUNT
    const targetWords = pickScenarioVocabulary(scenario, level, targetCount)
    const acts = getScenarioActs(scenario, level)
    return {
      id: scenario.id,
      name: scenario.name,
      icon: scenario.icon,
      level,
      targetWords,
      maxTurns: profile?.maxTurns ?? DEFAULT_MAX_TURNS,
      objectives: (scenario.objectives ?? []).map((obj) => ({
        id: obj.id,
        description: obj.description,
        descriptionEn: obj.descriptionEn,
        keywords: obj.keywords,
        targetWords: obj.targetWords ?? [],
      })),
      turnsCount: 0,
      wordsUsed: new Set(),
      levelProfile: profile,
      actThemes: acts.map((act) => act.vocabThemes ?? []),
    }
  }

  /**
   * 构建课程开始时的场景响应（初始状态）
   */
  private buildScenarioResponse(scenario: ScenarioState) {
    return {
      id: scenario.id,
      name: scenario.name,
      icon: scenario.icon,
      targetWords: scenario.targetWords,
      targetWordsTotal: scenario.targetWords.length,
      wordsLearned: [],
      level: scenario.level,
      turnsCount: scenario.turnsCount,
      maxTurns: scenario.maxTurns,
      coverageRate: 0,
      stars: 0 as 0 | 3 | 4 | 5,
    }
  }
}
