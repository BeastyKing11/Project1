/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        base: "18px",
        lg: "20px",
        xl: "22px"
      }
    }
  },
  plugins: []
};

