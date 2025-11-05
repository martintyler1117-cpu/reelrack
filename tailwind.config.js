/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          925: "#0e1420"
        }
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem"
      }
    },
  },
  plugins: [],
}
