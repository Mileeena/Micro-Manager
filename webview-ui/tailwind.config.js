/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: 'var(--vscode-editor-background)',
          fg: 'var(--vscode-editor-foreground)',
          sidebar: 'var(--vscode-sideBar-background)',
          input: 'var(--vscode-input-background)',
          inputFg: 'var(--vscode-input-foreground)',
          border: 'var(--vscode-panel-border)',
          button: 'var(--vscode-button-background)',
          buttonFg: 'var(--vscode-button-foreground)',
          buttonHover: 'var(--vscode-button-hoverBackground)',
          accent: 'var(--vscode-focusBorder)',
        },
      },
      animation: {
        'pixel-bob': 'pixelBob 1.5s ease-in-out infinite',
        'pixel-pulse': 'pixelPulse 1s ease-in-out infinite',
        'pixel-type': 'pixelType 0.4s steps(2) infinite',
      },
      keyframes: {
        pixelBob: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        pixelPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        pixelType: {
          '0%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-2px)' },
          '100%': { transform: 'translateY(0px)' },
        },
      },
    },
  },
  plugins: [],
};
