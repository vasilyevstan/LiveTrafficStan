import {
  vesselPhotoIdentityKey,
  type DynamicVesselPhoto,
  type VesselPhotoIdentity,
} from '../domain/vesselPhoto'
import type { PhotoProvider } from '../providers/photo'
import {
  PhotoController,
  sharedPhotoSessionFor,
  type PhotoControllerConfig,
  type PhotoControllerRuntime,
  type SharedPhotoSession,
} from './PhotoController'

type VesselPhotoProvider = PhotoProvider<VesselPhotoIdentity, DynamicVesselPhoto>
const sessions = new WeakMap<VesselPhotoProvider, SharedPhotoSession<DynamicVesselPhoto>>()

export class VesselPhotoController extends PhotoController<VesselPhotoIdentity, DynamicVesselPhoto> {
  constructor(
    provider: VesselPhotoProvider,
    config: PhotoControllerConfig,
    runtime?: PhotoControllerRuntime,
  ) {
    super(provider, config, vesselPhotoIdentityKey, sharedPhotoSessionFor(provider, sessions), runtime)
  }
}
