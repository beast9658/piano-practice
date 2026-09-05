import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { PianoInputProvider } from '../features/instrument/input/PianoInputProvider'
import { ThemeProvider } from '../features/settings/ThemeProvider'

type AppProvidersProps = {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PianoInputProvider>{children}</PianoInputProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
