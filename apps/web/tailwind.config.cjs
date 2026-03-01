/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        pixel: {
          bg: "#07060a",
          panel: "#2d0f27",
          panel2: "#38002e",
          border: "#cf4a86",
          text: "#ffffff",
          muted: "#d5a2be",
          accent: "#35e6ff",
          danger: "#ff5f9e"
        }
      },
      fontFamily: {
        body: ["Noto Sans Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
        heading: ["Jersey 25", "Press Start 2P", "VT323", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        pixel: "0 0 0 1px #35e6ff, 3px 3px 0 #07060a, -1px -1px 0 #cf4a86"
      }
    }
  },
  plugins: []
};
