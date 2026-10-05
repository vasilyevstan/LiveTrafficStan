import {
  aircraftPhotoIdentityKey,
  type AircraftPhoto,
  type AircraftPhotoIdentity,
} from '../domain/aircraftPhoto'
import type { AircraftPhotoProvider } from '../providers/aircraftPhoto/planespottersPhotoProvider'
import {
  PhotoController,
  sharedPhotoSessionFor,
  type PhotoControllerConfig,
  type PhotoControllerRuntime,
  type SharedPhotoSession,
} from './PhotoController'

const sessions = new WeakMap<AircraftPhotoProvider, SharedPhotoSession<AircraftPhoto>>()

export class AircraftPhotoController extends PhotoController<AircraftPhotoIdentity, AircraftPhoto> {
  constructor(
    provider: AircraftPhotoProvider,
    config: PhotoControllerConfig,
    runtime?: PhotoControllerRuntime,
  ) {
    super(provider, config, aircraftPhotoIdentityKey, sharedPhotoSessionFor(provider, sessions), runtime)
  }
}
