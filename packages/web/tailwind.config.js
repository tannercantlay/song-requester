/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Last Call" — a room lit by one amber bulb. Warm near-blacks rather
        // than blue-grey slate, so the accent reads as light falling on
        // something instead of a colour floating on a cold surface.
        ink: {
          900: "#0b0907",
          800: "#12100d",
          700: "#191512",
          600: "#221d18",
          500: "#2e2721",
          400: "#3d342c",
        },
        bone: {
          DEFAULT: "#f4ece1",
          dim: "#a99c8c",
          faint: "#6d6156",
        },
        // One dominant accent. Sodium-vapour amber: stage wash, VU meter,
        // the light over a pool table.
        sodium: {
          DEFAULT: "#ffa724",
          bright: "#ffc061",
          deep: "#c97c12",
        },
        // Sharp accents, used sparingly and never in the same view.
        ember: "#ff5636", // destructive
        mint: "#5fd6a4", // played / confirmed
      },
      fontFamily: {
        display: ["'Bricolage Grotesque Variable'", "ui-sans-serif", "sans-serif"],
        mono: ["'JetBrains Mono Variable'", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        marquee: "0.18em",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,167,36,0.5)" },
          "70%": { boxShadow: "0 0 0 7px rgba(255,167,36,0)" },
        },
        marquee: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        rise: "rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        glow: "glow 2.4s ease-out infinite",
        marquee: "marquee 7s linear infinite",
      },
    },
  },
  plugins: [],
};
