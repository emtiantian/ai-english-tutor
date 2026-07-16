import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
