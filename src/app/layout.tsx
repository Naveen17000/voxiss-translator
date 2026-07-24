import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed, IBM_Plex_Serif } from 'next/font/google'
import './globals.css'

/**
 * One superfamily across three roles. Plex was designed as a multilingual
 * system with very wide script coverage, which is the same problem this
 * pipeline exists to solve — so it is the family, rather than a family.
 */
const display = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const body = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Translation & quality report — English → Spanish',
  description:
    'Context-aware translation and objective quality scoring for product UI strings, powered by Claude.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
