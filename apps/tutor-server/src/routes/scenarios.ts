import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getScenariosForLevel, getAllScenarios, getScenarioById } from '@ai-english-tutor/shared'

/**
 * Scenario API routes
 *
 * GET /api/scenarios          - List all scenarios (optional ?level=N filter)
 * GET /api/scenarios/:id      - Get a specific scenario by ID
 */
export async function scenarioRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/scenarios
   * List available scenarios, optionally filtered by level
   */
  server.get(
    '/api/scenarios',
    async (request: FastifyRequest<{ Querystring: { level?: string } }>, reply) => {
      const { level } = request.query

      let scenarios
      if (level) {
        const levelNum = parseInt(level, 10)
        if (isNaN(levelNum) || levelNum < 1 || levelNum > 6) {
          return reply.status(400).send({
            error: 'Level must be 1-6',
            code: 'INVALID_LEVEL',
          })
        }
        scenarios = getScenariosForLevel(levelNum)
      } else {
        scenarios = getAllScenarios()
      }

      return reply.send({
        scenarios: scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          nameEn: s.nameEn,
          description: s.description,
          icon: s.icon,
          level: s.level,
          targetWords: s.targetWords,
          role: s.role,
          objectives: s.objectives.map((obj) => ({
            id: obj.id,
            description: obj.description,
            descriptionEn: obj.descriptionEn,
          })),
        })),
      })
    },
  )

  /**
   * GET /api/scenarios/:id
   * Get a specific scenario by ID
   */
  server.get(
    '/api/scenarios/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const scenario = getScenarioById(request.params.id)

      if (!scenario) {
        return reply.status(404).send({
          error: 'Scenario not found',
          code: 'SCENARIO_NOT_FOUND',
        })
      }

      return reply.send({
        id: scenario.id,
        name: scenario.name,
        nameEn: scenario.nameEn,
        description: scenario.description,
        icon: scenario.icon,
        level: scenario.level,
        topics: scenario.topics,
        targetWords: scenario.targetWords,
        role: scenario.role,
        setting: scenario.setting,
        objectives: scenario.objectives,
      })
    },
  )
}
