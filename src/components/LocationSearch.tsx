import type { RefObject } from 'react'

import type { PlaceSearchState } from '../app/PlaceSearchController'
import type { LocationSearchModel } from './useLocationSearchModel'

interface LocationSearchInputProps {
  model: LocationSearchModel
  inputRef: RefObject<HTMLInputElement | null>
  maximumQueryLength: number
  searchState: PlaceSearchState
  disabled?: boolean
  unified?: boolean
  busy?: boolean
}

interface LocationSearchDetailsProps {
  model: LocationSearchModel
  activeLabel: string
  searchState: PlaceSearchState
}

const searchMessage = (state: PlaceSearchState) => {
  switch (state.phase) {
    case 'loading':
      return 'Searching Photon...'
    case 'results':
      return `${state.results.length} place result${state.results.length === 1 ? '' : 's'} found.`
    case 'empty':
      return 'No matching places found.'
    case 'error':
      return state.message
    case 'idle':
      return undefined
  }
}

export function LocationSearchInput({
  model,
  inputRef,
  maximumQueryLength,
  searchState,
  disabled = false,
  unified = false,
  busy = false,
}: LocationSearchInputProps) {
  return (
    <form
      className="location-search__form location-search__form--compact"
      role="search"
      aria-label={unified ? 'Find objects or places' : 'Go to a location'}
      aria-busy={busy || searchState.phase === 'loading'}
      onSubmit={model.handleSubmit}
      onKeyDown={model.handleKeyDown}
    >
      <div className="location-search__input-row">
        <input
          ref={inputRef}
          id="location-search-input"
          type="search"
          enterKeyHint="search"
          value={model.value}
          maxLength={maximumQueryLength}
          placeholder={unified ? 'Find an object or place' : 'Place or 59.437, 24.754'}
          autoComplete="off"
          disabled={disabled}
          aria-label={unified ? 'Find by name, identifier, callsign or coordinates' : 'Place or coordinates'}
          aria-invalid={Boolean(model.inputError)}
          aria-describedby={
            model.inputError || searchMessage(searchState)
              ? 'location-search-help location-search-status'
              : 'location-search-help'
          }
          onChange={model.handleChange}
        />
        {unified && model.value && (
          <button type="button" className="object-find-clear" aria-label="Clear Find" onClick={model.clear}>
            <svg className="operation-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          aria-label={unified ? 'Search' : undefined}
          disabled={disabled || busy || searchState.phase === 'loading'}
        >
          {unified ? 'Search' : searchState.phase === 'loading' ? 'SEARCHING...' : 'GO'}
        </button>
      </div>
    </form>
  )
}

export function LocationSearchDetails({
  model,
  activeLabel,
  searchState,
}: LocationSearchDetailsProps) {
  const message = searchMessage(searchState)

  return (
    <section
      className="control-group location-search location-search__details"
      aria-label="Location search details"
      onKeyDown={model.handleKeyDown}
    >
      <p className="eyebrow">Location</p>
      <p className="control-note location-search__active">
        <strong>Viewing:</strong> {activeLabel}
      </p>

      {model.inputError && (
        <p
          id="location-search-status"
          className="control-note location-search__error"
          role="alert"
        >
          {model.inputError}
        </p>
      )}
      {!model.inputError && message && (
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
              <button
                type="button"
                onClick={() => model.selectResult(result)}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p id="location-search-help" className="control-note control-note--muted">
        Photon gets text in a URL + network metadata. Coordinates stay local.
      </p>
      <p className="control-note control-note--muted">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        {' · '}
        <a
          href="https://photon.komoot.io/"
          target="_blank"
          rel="noreferrer"
        >
          Photon
        </a>
      </p>
    </section>
  )
}
