// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
      extend: {
        colors: {
          galaxical: {
            purple: '#8e44ad',
            blue: '#2980b9',
            glow: '#00ffff',
            dark: '#0a0a0a',
          },
        },
        animation: {
          pulseGlow: 'pulseGlow 2s infinite',
        },
        keyframes: {
          pulseGlow: {
            '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 6px #00ffff)' },
            '50%': { opacity: 0.5, filter: 'drop-shadow(0 0 12px #00ffff)' },
          },
        },
      },
    },
    plugins: [],
  }
  
  