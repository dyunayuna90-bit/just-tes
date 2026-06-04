/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./www/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        m3: {
          primary: 'var(--md-sys-color-primary)', onPrimary: 'var(--md-sys-color-on-primary)',
          primaryContainer: 'var(--md-sys-color-primary-container)', onPrimaryContainer: 'var(--md-sys-color-on-primary-container)',
          secondaryContainer: 'var(--md-sys-color-secondary-container)', onSecondaryContainer: 'var(--md-sys-color-on-secondary-container)',
          tertiaryContainer: 'var(--md-sys-color-tertiary-container)', onTertiaryContainer: 'var(--md-sys-color-on-tertiary-container)',
          bg: 'var(--md-sys-color-background)', onBg: 'var(--md-sys-color-on-background)',
          surface: 'var(--md-sys-color-surface)', onSurface: 'var(--md-sys-color-on-surface)',
          surfaceVariant: 'var(--md-sys-color-surface-variant)', onSurfaceVariant: 'var(--md-sys-color-on-surface-variant)',
        }
      },
      borderRadius: { '4xl': '32px', '5xl': '48px', 'inherit': 'inherit' },
      fontFamily: {     
        merriweather: ['Merriweather', 'serif'],
        playfair: ['"Playfair Display"', 'serif'],
        mono: ['"Space Mono"', 'monospace'],
        google: ['"Google Sans Flex"', 'sans-serif']
      }
    }
  }
}
