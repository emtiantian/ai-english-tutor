import type { AITeacherProvider, TeachingInput, TeachingResponse } from '@ai-english-tutor/shared'
import type { TutorClient } from '../client/TutorClient'

/**
 * 远程 AI 教师 Provider —— 与 tutor-server 后端通信。
 *
 * 实现 AITeacherProvider 接口，用于角色点击身体时的“帮我回答”等非流式交互。
 */
export class RemoteTeacherProvider implements AITeacherProvider {
  constructor(private client: TutorClient) {}

  async generateResponse(input: TeachingInput): Promise<TeachingResponse> {
    // 通知 UI：用户消息已发送
    this.client.emit('message.user', {
      text: input.text,
      isVoice: false,
    })

    // 通知 UI：AI 正在思考
    this.client.emit('state.thinking', undefined)

    // 发送 HTTP 请求并等待完整响应。
    // 后端也会广播 SSE 事件，但这条 provider 路径需要同步的 TeachingResponse，
    // 因此使用非流式模式。
    const response = await this.client.sendMessage({
      type: 'user.speak',
      text: input.text,
      level: input.level,
    })

    return {
      text: response.text,
      motionId: response.motionId,
      expressionId: response.expressionId,
      vocabulary: response.vocabulary,
    }
  }
}
