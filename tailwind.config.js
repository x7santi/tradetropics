/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // App surface scale — deep navy, not pure black
        surface: {
          base:  '#060d1a',
          1:     '#0b1526',
          2:     '#101e32',
          3:     '#162440',
        },
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 32px 0 rgba(0,0,0,0.4)',
        'glass-sm': '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 2px 8px 0 rgba(0,0,0,0.3)',
        // depth tokens for 2016-sleek premium feel
        'panel': '0 1px 0 rgba(255,255,255,0.07) inset, 0 4px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
        'card': '0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 12px rgba(0,0,0,0.4)',
        'btn': '0 1px 0 rgba(255,255,255,0.16) inset, 0 2px 6px rgba(0,0,0,0.45)',
        'input': '0 2px 4px rgba(0,0,0,0.4) inset, 0 1px 0 rgba(0,0,0,0.2) inset',
        'glow-blue': '0 0 20px rgba(59,130,246,0.3)',
        'glow-indigo': '0 0 20px rgba(99,102,241,0.3)',
        'glow-green': '0 0 14px rgba(34,197,94,0.28)',
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.07)',
        'glass-strong': 'rgba(255,255,255,0.12)',
        'glass-dim': 'rgba(255,255,255,0.04)',
      },
      animation: {
        'fade-in':  'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'shake':    'shake 0.38s ease-in-out',
        'report-flash': 'reportFlash 0.75s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        reportFlash: {
          '0%':   { backgroundColor: 'rgba(255,255,255,0.34)', color: '#ffffff', boxShadow: '0 0 0 1px rgba(255,255,255,0.55), 0 0 18px rgba(255,255,255,0.38)' },
          '45%':  { backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff', boxShadow: '0 0 0 1px rgba(255,255,255,0.34), 0 0 14px rgba(255,255,255,0.25)' },
          '100%': { backgroundColor: 'transparent', color: 'inherit', boxShadow: 'none' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%':  { transform: 'translateX(-5px)' },
          '30%':  { transform: 'translateX(5px)'  },
          '45%':  { transform: 'translateX(-4px)' },
          '60%':  { transform: 'translateX(4px)'  },
          '75%':  { transform: 'translateX(-2px)' },
          '90%':  { transform: 'translateX(2px)'  },
        },
      },
    },
  },
  plugins: [],
}
