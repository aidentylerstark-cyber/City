import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'City Link',
    template: '%s · City Link',
  },
  description:
    'The management system for Second Life communities — dispatch, records, documents, and cross-town search.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  )
}
