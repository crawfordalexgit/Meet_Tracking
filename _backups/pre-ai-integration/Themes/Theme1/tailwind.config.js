module.exports = {
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        tealGlow: '#0dc7c1',
        deepBlue: '#071827',
        cardBlue: '#0b3b48'
      },
      backgroundImage: {
        'water-pattern': "url('/background.svg')"
      }
    }
  },
  plugins: [],
}
