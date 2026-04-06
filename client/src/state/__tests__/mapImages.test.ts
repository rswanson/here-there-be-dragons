import { describe, it, expect, beforeEach } from 'vitest';
import { useMapImageStore } from '../mapImages';

describe('useMapImageStore', () => {
  beforeEach(() => {
    useMapImageStore.setState(useMapImageStore.getInitialState());
  });

  it('starts with empty images', () => {
    expect(useMapImageStore.getState().images).toEqual([]);
  });

  it('loads images', () => {
    useMapImageStore.getState().loadImages([
      { id: 'img1', layer_id: 'l1', asset_id: 'a1', x: 0, y: 0, width: 30, height: 20, rotation: 0, opacity: 1 },
      { id: 'img2', layer_id: 'l1', asset_id: 'a2', x: 5, y: 5, width: 10, height: 10, rotation: 0, opacity: 0.5 },
    ]);
    expect(useMapImageStore.getState().images.length).toBe(2);
  });

  it('adds a new image', () => {
    const img = { id: 'img1', layer_id: 'l1', asset_id: 'a1', x: 0, y: 0, width: 30, height: 20, rotation: 0, opacity: 1 };
    useMapImageStore.getState().addImage(img);
    expect(useMapImageStore.getState().images.length).toBe(1);
  });

  it('does not duplicate image on add', () => {
    const img = { id: 'img1', layer_id: 'l1', asset_id: 'a1', x: 0, y: 0, width: 30, height: 20, rotation: 0, opacity: 1 };
    useMapImageStore.getState().addImage(img);
    useMapImageStore.getState().addImage(img);
    expect(useMapImageStore.getState().images.length).toBe(1);
  });

  it('updates an existing image', () => {
    useMapImageStore.getState().loadImages([
      { id: 'img1', layer_id: 'l1', asset_id: 'a1', x: 0, y: 0, width: 30, height: 20, rotation: 0, opacity: 1 },
    ]);
    useMapImageStore.getState().updateImage('img1', { x: 5, y: 10 });
    const img = useMapImageStore.getState().images[0];
    expect(img.x).toBe(5);
    expect(img.y).toBe(10);
    expect(img.width).toBe(30);
  });

  it('removes an image', () => {
    useMapImageStore.getState().loadImages([
      { id: 'img1', layer_id: 'l1', asset_id: 'a1', x: 0, y: 0, width: 30, height: 20, rotation: 0, opacity: 1 },
      { id: 'img2', layer_id: 'l1', asset_id: 'a2', x: 5, y: 5, width: 10, height: 10, rotation: 0, opacity: 1 },
    ]);
    useMapImageStore.getState().removeImage('img1');
    expect(useMapImageStore.getState().images.length).toBe(1);
    expect(useMapImageStore.getState().images[0].id).toBe('img2');
  });
});
