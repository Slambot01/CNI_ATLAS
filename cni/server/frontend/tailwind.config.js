/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        cni: {
          bg: '#060a13',
          surface: '#0c1220',
          'surface-2': '#111827',
          border: '#1a2235',
          'border-light': '#243044',
          accent: '#3b82f6',
          'accent-cyan': '#22d3ee',
          text: '#e2e8f0',
          muted: '#64748b',
        },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
