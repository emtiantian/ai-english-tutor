import { LUNA_PERSONA, type CharacterPersona, type OpeningStyle } from '@ai-english-tutor/shared'

export type { OpeningStyle }

/**
 * 从角色预设列表中固定挑选默认开场风格
 *
 * 优先使用 `lazy-mature`；找不到时回退到第一个风格。
 */
export function pickOpeningStyle(persona: CharacterPersona = LUNA_PERSONA): OpeningStyle {
  const styles = persona.styles
  return styles.find(s => s.name === 'lazy-mature') ?? styles[0]
}
