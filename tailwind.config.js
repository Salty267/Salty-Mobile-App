/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#eef0fb',
        surface: '#ffffff',
        fg: '#1a1530',
        muted: '#6b6a85',
        border: '#e7e5f3',
        secondary: '#f1eefb',
        brand: '#4f6cf2',
        'brand-to': '#a25cf2',
        ember: '#E8581A',
      },
      fontFamily: {
        bebas: ['BebasNeue_400Regular'],
        sans: ['DMSans_400Regular'],
        'sans-medium': ['DMSans_500Medium'],
        'sans-bold': ['DMSans_700Bold']
      }
    }
  },
  plugins: []
};
