export const mcpResult = (payload: Record<string, string>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  isError: false,
})

export const mcpError = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
})
