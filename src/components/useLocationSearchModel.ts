import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import type { PlaceSearchState } from '../app/PlaceSearchController'
import type { AppCenter } from '../config/appConfig'
import { parseLocationInput } from '../domain/locationInput'
import type { PlaceSearchResult } from '../providers/geocoding/photonProvider'

interface UseLocationSearchModelOptions {
  coordinatePrecision: number
  maximumQueryLength: number
  searchState: PlaceSearchState
  onSearch: (query: string) => void
  onNavigate: (center: AppCenter) => void
  onSelectResult: (result: PlaceSearchResult) => void
  onCancel: () => void
  onRevealDetails?: () => void
}

export interface LocationSearchModel {
  value: string
  inputError?: string
  handleChange: (event: ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  selectResult: (result: PlaceSearchResult) => void
}

export function useLocationSearchModel({
  coordinatePrecision,
  maximumQueryLength,
  searchState,
  onSearch,
  onNavigate,
  onSelectResult,
  onCancel,
  onRevealDetails,
}: UseLocationSearchModelOptions) {
  const [value, setValue] = useState('')
  const [inputError, setInputError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
    setInputError(undefined)
    if (searchState.phase !== 'idle') onCancel()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (searchState.phase === 'loading') return

    const parsed = parseLocationInput(
      value,
      coordinatePrecision,
      maximumQueryLength,
    )
    if (parsed.kind === 'error') {
      setInputError(parsed.message)
      onRevealDetails?.()
      return
    }

    setInputError(undefined)
    if (parsed.kind === 'coordinates') {
      onNavigate(parsed.center)
      setValue(parsed.center.label)
      inputRef.current?.focus()
      return
    }

    onRevealDetails?.()
    onSearch(parsed.query)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onCancel()
    inputRef.current?.focus()
  }

  const selectResult = (result: PlaceSearchResult) => {
    onSelectResult(result)
    setValue(result.label)
    inputRef.current?.focus()
  }

  const model: LocationSearchModel = {
    value,
    inputError,
    handleChange,
    handleSubmit,
    handleKeyDown,
    selectResult,
  }

  return [model, inputRef] as const
}
