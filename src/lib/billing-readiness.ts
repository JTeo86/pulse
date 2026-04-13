export function isMissingBillingSchemaError(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? '';
  const code = (error as { code?: string } | null)?.code ?? '';
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('could not find the table')
    || message.includes('relation') && message.includes('does not exist');
}

export function isFunctionNotDeployedError(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? '';
  return message.includes('failed to send a request')
    || message.includes('edge function returned a non-2xx') && message.includes('404')
    || message.includes('function not found');
}
