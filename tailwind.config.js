/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nublue: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b3ccff',
          300: '#80a8ff',
          400: '#4d7fff',
          500: '#1a56f5',
          600: '#0033A0', // NU Blue
          700: '#00287d',
          800: '#001d5c',
          900: '#00133d',
        },
        nugold: {
          50: '#fffdf5',
          100: '#fff6d9',
          200: '#ffecad',
          300: '#ffe081',
          400: '#ffd455',
          500: '#FFC72C', // NU Gold
          600: '#e6ac00',
          700: '#b38600',
          800: '#805f00',
          900: '#4d3900',
        },
      },
      boxShadow: {
        glow: '0 8px 20px -6px rgba(0, 51, 160, 0.45)',
      },
    },
  },
  plugins: [],
}
