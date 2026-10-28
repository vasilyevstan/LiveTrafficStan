import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import {
  addSavedObject,
  clearSavedObjects,
  readSavedObjects,
  removeSavedObject,
  savedObjectKey,
  SAVED_OBJECTS_CHANNEL,
  SAVED_OBJECTS_INVALIDATION_KEY,
  SAVED_OBJECTS_STORAGE_KEY,
  type SavedObject,
  type SavedObjectsLoadResult,
  type SavedObjectsMutationResult,
  type SavedObjectsStorage,
} from '../domain/savedObjects'

const browserStorage = (): SavedObjectsStorage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const useSavedObjects = (limits: AppConfig['saved']) => {
  const [state, setState] = useState<SavedObjectsLoadResult>(() =>
    readSavedObjects(browserStorage(), limits),
  )
  const channelRef = useRef<BroadcastChannel | undefined>(undefined)

  const reload = useCallback(() => {
    setState(readSavedObjects(browserStorage(), limits))
  }, [limits])

  const notify = useCallback((result: SavedObjectsMutationResult) => {
    if (!result.ok) {
      setState(readSavedObjects(browserStorage(), limits))
      return
    }
    setState({ phase: 'ready', document: result.document })
    channelRef.current?.postMessage({
      revision: result.document.revision,
      clearEpoch: result.document.clearEpoch,
    })
    try {
      window.localStorage.setItem(
        SAVED_OBJECTS_INVALIDATION_KEY,
        JSON.stringify({
          revision: result.document.revision,
          clearEpoch: result.document.clearEpoch,
          at: Date.now(),
        }),
      )
    } catch {
      // BroadcastChannel remains the primary cross-tab invalidation path.
    }
  }, [limits])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === SAVED_OBJECTS_STORAGE_KEY ||
        event.key === SAVED_OBJECTS_INVALIDATION_KEY
      ) {
        reload()
      }
    }
    window.addEventListener('storage', handleStorage)
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(SAVED_OBJECTS_CHANNEL)
      channelRef.current = channel
      channel.addEventListener('message', reload)
    }
    return () => {
      window.removeEventListener('storage', handleStorage)
      channelRef.current?.close()
      channelRef.current = undefined
    }
  }, [reload])

  const save = useCallback((entry: SavedObject) => {
    const result = addSavedObject(browserStorage(), entry, limits)
    notify(result)
    return result
  }, [limits, notify])

  const remove = useCallback((key: string) => {
    const result = removeSavedObject(browserStorage(), key, limits)
    notify(result)
    return result
  }, [limits, notify])

  const clear = useCallback(() => {
    const result = clearSavedObjects(browserStorage(), limits)
    notify(result)
    return result
  }, [limits, notify])
  const restore = useCallback((entry: SavedObject, expectedClearEpoch: number) => {
    const result = addSavedObject(
      browserStorage(),
      entry,
      limits,
      expectedClearEpoch,
    )
    notify(result)
    return result
  }, [limits, notify])

  const keys = useMemo(
    () => new Set(state.document.entries.map(savedObjectKey)),
    [state.document.entries],
  )

  return {
    entries: state.document.entries,
    status: state,
    isSaved: (entry: Pick<SavedObject, 'kind' | 'id'>) =>
      keys.has(savedObjectKey(entry as SavedObject)),
    save,
    remove,
    clear,
    restore,
    reload,
  }
}
