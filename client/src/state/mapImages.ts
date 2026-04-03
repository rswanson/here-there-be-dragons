import { create } from 'zustand'
import type { MapImage } from '../types/MapImage'

interface MapImageState {
  images: MapImage[]
  loadImages: (images: MapImage[]) => void
  addImage: (image: MapImage) => void
  updateImage: (imageId: string, patch: Partial<MapImage>) => void
  removeImage: (imageId: string) => void
}

export const useMapImageStore = create<MapImageState>()((set) => ({
  images: [],
  loadImages: (images) => set({ images }),
  addImage: (image) =>
    set((s) => ({
      images: s.images.some((i) => i.id === image.id) ? s.images : [...s.images, image],
    })),
  updateImage: (imageId, patch) =>
    set((s) => ({
      images: s.images.map((i) => (i.id === imageId ? { ...i, ...patch } : i)),
    })),
  removeImage: (imageId) =>
    set((s) => ({ images: s.images.filter((i) => i.id !== imageId) })),
}))
