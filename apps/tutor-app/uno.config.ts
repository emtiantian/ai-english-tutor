import { defineConfig, presetUno, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons(),
  ],
  theme: {
    colors: {
      primary: {
        DEFAULT: '#3b82f6',
        50: 'rgba(59, 130, 246, 0.5)',
        80: 'rgba(59, 130, 246, 0.8)',
        90: 'rgba(59, 130, 246, 0.9)',
      },
      danger: {
        DEFAULT: '#ef4444',
        80: 'rgba(239, 68, 68, 0.8)',
        90: 'rgba(239, 68, 68, 0.9)',
      },
      surface: {
        DEFAULT: 'rgba(40, 40, 50, 0.95)',
        dark: 'rgba(0, 0, 0, 0.6)',
        darker: 'rgba(0, 0, 0, 0.7)',
        light: 'rgba(255, 255, 255, 0.08)',
        lighter: 'rgba(255, 255, 255, 0.15)',
        border: 'rgba(255, 255, 255, 0.1)',
        'border-light': 'rgba(255, 255, 255, 0.2)',
        text: 'rgba(255, 255, 255, 0.7)',
        'text-dim': 'rgba(255, 255, 255, 0.4)',
        'text-muted': 'rgba(255, 255, 255, 0.6)',
      },
    },
    animation: {
      keyframes: {
        'thinking-bounce': '{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}',
        'message-in': '{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
        'pulse': '{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}',
        'blink': '{50%{opacity:0}}',
        'fade-in': '{from{opacity:0;transform:translate(-50%,-50%) scale(0.9)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}',
      },
      durations: {
        'thinking-bounce': '1.4s',
        'message-in': '0.3s',
        'pulse': '1s',
        'blink': '1s',
        'fade-in': '0.2s',
      },
      timingFns: {
        'thinking-bounce': 'ease-in-out',
        'message-in': 'ease',
        'pulse': 'ease-in-out',
        'blink': 'step-end',
        'fade-in': 'ease',
      },
      counts: {
        'thinking-bounce': 'infinite',
        'pulse': 'infinite',
        'blink': 'infinite',
      },
    },
  },
  shortcuts: {
    // Glassmorphism card
    'glass': 'bg-black/60 backdrop-blur-16px border border-white/10 rounded-24px',
    'glass-sm': 'bg-black/40 backdrop-blur-8px rounded-16px',
    // Pill button
    'btn-pill': 'rounded-30px border border-white/40 bg-white/8 backdrop-blur-10px text-white cursor-pointer transition-all',
    'btn-pill-active': 'scale-96 bg-white/15',
    // Blue accent button
    'btn-primary': 'h-40px px-20px rounded-20px bg-primary-80 text-white text-14px cursor-pointer transition-all flex-shrink-0 hover:bg-primary active:scale-95',
    // Input field
    'input-pill': 'flex-1 h-40px px-14px rounded-20px bg-white/8 text-white text-15px outline-none placeholder-white/40',
    // Dot indicator
    'dot-blink': 'w-6px h-6px rounded-full bg-white/60 animate-thinking-bounce',
  },
  rules: [
    ['animate-delay-200', { 'animation-delay': '0.2s' }],
    ['animate-delay-400', { 'animation-delay': '0.4s' }],
  ],
})
