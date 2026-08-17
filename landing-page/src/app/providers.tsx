'use client'

import { ThemeProvider } from '@primer/react-brand'

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider colorMode="dark">{children}</ThemeProvider>
}
