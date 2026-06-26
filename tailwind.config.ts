import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{ts,tsx,js,jsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#C9951A',
        black: '#111111',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        bebas: ['"Bebas Neue"', 'cursive'],
      },
    },
  },
  plugins: [],
}

export default config
