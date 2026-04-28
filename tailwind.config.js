/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        feishu: {
          blue: '#3370ff',
          dark: '#1f2329',
          light: '#f5f6f7'
        }
      }
    },
  },
  plugins: [],
}