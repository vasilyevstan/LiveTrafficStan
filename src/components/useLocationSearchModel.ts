import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import type { PlaceSearchState } from '../app/PlaceSearchController'
import { workspaceOwnsFullscreen } from '../app/fullscreen'
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
  onPause?: () => void
  queryPaused?: boolean
  onRevealDetails?: () => void
}

export interface LocationSearchModel {
  value: string
  inputError?: string
  handleChange: (event: ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (event: FormEvent<HTMLFormElement>) => ReturnType<typeof parseLocationInput> | undefined
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  selectResult: (result: PlaceSearchResult) => void
  clear: () => void
  cancel: () => void
  pause: () => void
  setValue?: (value: string) => void
}

export function useLocationSearchModel({
  coordinatePrecision,
  maximumQueryLength,
  searchState,
  onSearch,
  onNavigate,
  onSelectResult,
  onCancel,
  onPause = onCancel,
  queryPaused = false,
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
      return parsed
    }

    setInputError(undefined)
    if (parsed.kind === 'coordinates') {
      onNavigate(parsed.center)
      setValue(parsed.center.label)
      inputRef.current?.focus()
      return parsed
    }

    if (queryPaused || document.hidden || !navigator.onLine) {
      const message = document.hidden ? 'Online search is paused while this tab is hidden.' :
        !navigator.onLine ? 'Offline. Reconnect to search online; coordinates still work.' :
          'Online search is paused in this view. Return to LIVE/the map to search online.'
      setInputError(message)
      onRevealDetails?.()
      return { kind: 'error' as const, message }
    }

    onRevealDetails?.()
    onSearch(parsed.query)
    return parsed
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || workspaceOwnsFullscreen(event.currentTarget)) return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
    inputRef.current?.focus()
  }

  const selectResult = (result: PlaceSearchResult) => {
    onSelectResult(result)
    setValue(result.label)
    inputRef.current?.focus()
  }

  const clear = () => {
    onCancel()
    setValue('')
    setInputError(undefined)
    inputRef.current?.focus()
  }

  const model: LocationSearchModel = {
    value,
    inputError,
    handleChange,
    handleSubmit,
    handleKeyDown,
    selectResult,
    clear,
    cancel: onCancel,
    pause: onPause,
    setValue: (nextValue) => {
      onCancel()
      setValue(nextValue.slice(0, maximumQueryLength))
      setInputError(undefined)
      inputRef.current?.focus()
    },
  }

  return [model, inputRef] as const
}
