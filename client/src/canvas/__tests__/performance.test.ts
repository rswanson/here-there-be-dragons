import { describe, it, expect, beforeEach } from 'vitest';
import { useTokenStore } from '../../state/tokens';
import { gridToPixel, pixelToGrid, gridDistance, snapToCenter } from '../math/grid';
import { simplifyPoints } from '../math/simplify';
import type { Token } from '../../types/Token';

/**
 * Performance benchmarks for core VTT operations.
 *
 * These tests guard against major performance regressions.
 * Thresholds are set at ~2x the target to avoid CI flakiness.
 */

function makeToken(i: number): Token {
  return {
    id: `token-${i}`,
    layer_id: 'layer-1',
    name: `Token ${i}`,
    asset_id: null,
    owner_id: null,
    x: Math.random() * 2000,
    y: Math.random() * 2000,
    size: 1,
    rotation: 0,
    bars: [],
    status_markers: [],
    has_vision: false,
    vision_range: 0,
    darkvision_range: 0,
    light_bright: 0,
    light_dim: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function generateSineWave(numPoints: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < numPoints; i++) {
    points.push({
      x: i * 2,
      y: Math.sin(i * 0.1) * 100 + Math.random() * 5,
    });
  }
  return points;
}

describe('Performance Benchmarks', () => {
  describe('Token store — 100 tokens', () => {
    beforeEach(() => {
      useTokenStore.setState({ tokens: [], selectedIds: [] });
    });

    it('loadTokens with 100 tokens completes in < 200ms (avg over 10 runs)', () => {
      const tokens = Array.from({ length: 100 }, (_, i) => makeToken(i));
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        useTokenStore.setState({ tokens: [], selectedIds: [] });

        const start = performance.now();
        useTokenStore.getState().loadTokens(tokens);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(200);
    });

    it('addToken 100 times completes in < 200ms (avg over 10 runs)', () => {
      const tokens = Array.from({ length: 100 }, (_, i) => makeToken(i));
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        useTokenStore.setState({ tokens: [], selectedIds: [] });

        const start = performance.now();
        for (const token of tokens) {
          useTokenStore.getState().addToken(token);
        }
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(200);
    });
  });

  describe('Grid math — 50x50 grid', () => {
    it('gridToPixel + pixelToGrid for 2500 cells completes in < 32ms (avg over 10 runs)', () => {
      const cellSize = 64;
      const gridSize = 50;
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        const start = performance.now();

        for (let col = 0; col < gridSize; col++) {
          for (let row = 0; row < gridSize; row++) {
            const pixel = gridToPixel(col, row, cellSize);
            pixelToGrid(pixel.x, pixel.y, cellSize);
          }
        }

        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(32);
    });

    it('snapToCenter for 2500 cells completes in < 32ms (avg over 10 runs)', () => {
      const cellSize = 64;
      const gridSize = 50;
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        const start = performance.now();

        for (let col = 0; col < gridSize; col++) {
          for (let row = 0; row < gridSize; row++) {
            snapToCenter(col * cellSize + 10, row * cellSize + 10, cellSize);
          }
        }

        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(32);
    });

    it('gridDistance for 2500 pairs completes in < 32ms (avg over 10 runs)', () => {
      const gridSize = 50;
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        const start = performance.now();

        for (let i = 0; i < gridSize; i++) {
          for (let j = 0; j < gridSize; j++) {
            gridDistance(0, 0, i, j, 5, 'dnd_standard');
          }
        }

        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(32);
    });
  });

  describe('Freehand simplification — RDP algorithm', () => {
    it('simplifyPoints with 500-point sine wave completes in < 10ms (avg over 10 runs)', () => {
      const points = generateSineWave(500);
      const epsilon = 3.0;
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        const start = performance.now();
        simplifyPoints(points, epsilon);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(10);
    });

    it('simplifyPoints actually reduces point count', () => {
      const points = generateSineWave(500);
      const result = simplifyPoints(points, 3.0);

      expect(result.length).toBeGreaterThan(2);
      expect(result.length).toBeLessThan(points.length);
    });

    it('simplifyPoints with 1000-point random path completes in < 10ms (avg over 10 runs)', () => {
      // Generate a random walk path
      const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];
      for (let i = 1; i < 1000; i++) {
        points.push({
          x: points[i - 1].x + Math.random() * 10 - 5,
          y: points[i - 1].y + Math.random() * 10 - 5,
        });
      }

      const epsilon = 2.0;
      const iterations = 10;
      const times: number[] = [];

      for (let run = 0; run < iterations; run++) {
        const start = performance.now();
        simplifyPoints(points, epsilon);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeLessThan(10);
    });
  });
});
