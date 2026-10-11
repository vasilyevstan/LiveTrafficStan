import { useId, type ButtonHTMLAttributes } from 'react'

type ResultPrefix =
  | 'aircraft-discovery-result'
  | 'vessel-discovery-result'
  | 'airport-context-result'
  | 'weather-context-result'
  | 'in-view-aircraft-result'
  | 'in-view-ships-result'
  | 'in-view-orbits-result'
  | 'orbital-context-result'
  | 'orbital-catalog-result'
  | 'starlink-catalog-result'

interface ObjectResultButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'id' | 'onClick' | 'onSelect' | 'type'
> {
  prefix: ResultPrefix
  onSelect: (originId: string) => void
}

export function ObjectResultButton({
  prefix,
  onSelect,
  ...props
}: ObjectResultButtonProps) {
  const id = `${prefix}-${useId()}`
  return <button id={id} type="button" {...props} onClick={() => onSelect(id)} />
}
