import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#e8edff',
          200: '#cddcff',
          300: '#abc3ff',
          400: '#7f9ef7',
          500: '#5d7ae8',
          600: '#425db8',
          700: '#324b94',
          800: '#243866',
          900: '#17253e',
        },
      },
      boxShadow: {
        soft: '0 20px 45px rgba(15, 23, 42, 0.14)',
      },
    },
  },
  plugins: [],
};

export default config;
