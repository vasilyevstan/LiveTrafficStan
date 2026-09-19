import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type { AppCenter } from '../config/appConfig'
import { parseLocationInput } from '../domain/locationInput'
import type { PlaceSearchState } from '../app/PlaceSearchController'
import type { PlaceSearchResult } from '../providers/geocoding/photonProvider'

interface LocationSearchProps {
  disabled: boolean
  activeLabel: string
  coordinatePrecision: number
  maximumQueryLength: number
  searchState: PlaceSearchState
  onSearch: (query: string) => void
  onNavigate: (center: AppCenter) => void
  onSelectResult: (result: PlaceSearchResult) => void
  onCancel: () => void
}

const searchMessage = (state: PlaceSearchState) => {
  switch (state.phase) {
    case 'loading':
      return `Searching for ${state.query}...`
    case 'results':
      return `${state.results.length} place result${state.results.length === 1 ? '' : 's'} found.`
    case 'empty':
      return `No matching places found for ${state.query}.`
    case 'error':
      return state.message
    case 'idle':
      return undefined
  }
}

export function LocationSearch({
  disabled,
  activeLabel,
  coordinatePrecision,
  maximumQueryLength,
  searchState,
  onSearch,
  onNavigate,
  onSelectResult,
  onCancel,
}: LocationSearchProps) {
  const [value, setValue] = useState('')
  const [inputError, setInputError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const message = searchMessage(searchState)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (searchState.phase === 'loading') return
    const parsed = parseLocationInput(
      value,
      coordinatePrecision,
      maximumQueryLength,
    )
    if (parsed.kind === 'error') {
      setInputError(parsed.message)
      return
    }

    setInputError(undefined)
    if (parsed.kind === 'coordinates') {
      onNavigate(parsed.center)
      setValue(parsed.center.label)
      inputRef.current?.focus()
      return
    }

    onSearch(parsed.query)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
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

  return (
    <fieldset
      className="control-group location-search"
      onKeyDown={handleKeyDown}
    >
      <legend>Location</legend>
      <form
        className="location-search__form"
        role="search"
        aria-label="Go to a location"
        aria-busy={searchState.phase === 'loading'}
        onSubmit={submit}
      >
        <label htmlFor="location-search-input">Place or coordinates</label>
        <div className="location-search__input-row">
          <input
            ref={inputRef}
            id="location-search-input"
            type="search"
            enterKeyHint="search"
            value={value}
            maxLength={maximumQueryLength}
            placeholder="Tallinn or 59.437, 24.754"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={Boolean(inputError)}
            aria-describedby={
              inputError || message
                ? 'location-search-help location-search-status'
                : 'location-search-help'
            }
            onChange={(event) => {
              setValue(event.target.value)
              setInputError(undefined)
              if (searchState.phase !== 'idle') onCancel()
            }}
          />
          <button
            type="submit"
            disabled={disabled || searchState.phase === 'loading'}
          >
            {searchState.phase === 'loading' ? 'SEARCHING...' : 'GO'}
          </button>
        </div>
      </form>

      <p className="control-note location-search__active">
        <strong>Viewing:</strong> {activeLabel}
      </p>

      {inputError && (
        <p
          id="location-search-status"
          className="control-note location-search__error"
          role="alert"
        >
          {inputError}
        </p>
      )}
      {!inputError && message && (
        <p
          id="location-search-status"
          className="control-note"
          role="status"
        >
          {message}
        </p>
      )}

      {searchState.phase === 'results' && (
        <ul className="location-results" aria-label="Place search results">
          {searchState.results.map((result) => (
            <li key={result.id}>
              <button type="button" onClick={() => selectResult(result)}>
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p id="location-search-help" className="control-note control-note--muted">
        Search text is sent in the request URL to Photon, which receives normal
        network metadata. Coordinate entry does not call Photon.
      </p>
      <p className="control-note control-note--muted">
        Search data{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        , powered by{' '}
        <a
          href="https://photon.komoot.io/"
          target="_blank"
          rel="noreferrer"
        >
          Photon
        </a>
        .
      </p>
    </fieldset>
  )
}
