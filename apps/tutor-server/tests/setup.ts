// Vitest setup file
// 仅设置全进程安全默认值；不要在这里 import 任何 src 模块，
// 否则会在测试有机会设置 process.env 之前就把 config.ts 等模块求值掉。
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'silent'
