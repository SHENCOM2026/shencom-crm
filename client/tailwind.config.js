import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,jsx}')
  ],
  theme: {
    extend: {
      colors: {
        claro: {
          red: '#DA291C',
          'red-dark': '#B71C1C',
          gray: '#333333',
          'gray-light': '#666666'
        }
      }
    }
  },
  plugins: []
}
