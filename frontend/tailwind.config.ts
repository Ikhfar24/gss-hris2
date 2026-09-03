import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bound to Company Settings primaryColor at runtime via CSS var,
        // so white-label branding doesn't require a rebuild (PRD section 18).
        brand: 'var(--brand-color, #0F172A)',
      },
    },
  },
  plugins: [],
};
export default config;
