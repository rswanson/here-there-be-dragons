/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { isDrawingTool, isAoeTool, hitTestDrawing } from '../DrawingTools';
import type { Drawing } from '../../types/Drawing';
import { simplifyPoints } from '../math/simplify';

describe('DrawingTools', () => {
  it('identifies drawing tools', () => {
    expect(isDrawingTool('freehand')).toBe(true);
    expect(isDrawingTool('line')).toBe(true);
    expect(isDrawingTool('rectangle')).toBe(true);
    expect(isDrawingTool('circle')).toBe(true);
    expect(isDrawingTool('polygon')).toBe(true);
    expect(isDrawingTool('eraser')).toBe(true);
    expect(isDrawingTool('select')).toBe(false);
    expect(isDrawingTool('pan')).toBe(false);
    expect(isDrawingTool('ruler')).toBe(false);
  });

  it('identifies AoE tools', () => {
    expect(isAoeTool('aoe_cone')).toBe(true);
    expect(isAoeTool('aoe_cube')).toBe(true);
    expect(isAoeTool('aoe_sphere')).toBe(true);
    expect(isAoeTool('aoe_line')).toBe(true);
    expect(isAoeTool('freehand')).toBe(false);
    expect(isAoeTool('select')).toBe(false);
  });

  describe('hitTestDrawing', () => {
    const makeDrawing = (overrides: Partial<Drawing>): Drawing => ({
      id: 'test-id',
      layer_id: 'layer-1',
      drawing_type: 'rectangle',
      points: null,
      stroke_color: '#ffffff',
      stroke_width: 2,
      stroke_opacity: 1,
      fill_color: null,
      fill_opacity: 0,
      created_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('hits a rectangle drawing whose bounding box contains the point', () => {
      const drawing = makeDrawing({
        drawing_type: 'rectangle',
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] as any,
      });
      expect(hitTestDrawing(drawing, 50, 50)).toBe(true);
    });

    it('misses a rectangle drawing outside the bounding box', () => {
      const drawing = makeDrawing({
        drawing_type: 'rectangle',
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] as any,
      });
      expect(hitTestDrawing(drawing, 200, 200)).toBe(false);
    });

    it('hits a circle drawing within radius', () => {
      const drawing = makeDrawing({
        drawing_type: 'circle',
        // center at (100,100), radius 50 -> point at (200,200) means second point
        points: [{ x: 100, y: 100 }, { x: 150, y: 100 }] as any,
      });
      expect(hitTestDrawing(drawing, 120, 100)).toBe(true);
    });

    it('misses a circle drawing outside radius', () => {
      const drawing = makeDrawing({
        drawing_type: 'circle',
        points: [{ x: 100, y: 100 }, { x: 150, y: 100 }] as any,
      });
      expect(hitTestDrawing(drawing, 200, 200)).toBe(false);
    });

    it('hits a line drawing near the stroke', () => {
      const drawing = makeDrawing({
        drawing_type: 'line',
        stroke_width: 10,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] as any,
      });
      expect(hitTestDrawing(drawing, 50, 3)).toBe(true);
    });

    it('misses a line drawing far from the stroke', () => {
      const drawing = makeDrawing({
        drawing_type: 'line',
        stroke_width: 4,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] as any,
      });
      expect(hitTestDrawing(drawing, 50, 50)).toBe(false);
    });
  });

  describe('simplifyPoints integration', () => {
    it('simplifies collinear points down to two endpoints', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 150, y: 0 },
        { x: 200, y: 0 },
      ];
      const simplified = simplifyPoints(points, 1);
      expect(simplified.length).toBe(2);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[simplified.length - 1]).toEqual({ x: 200, y: 0 });
    });

    it('preserves significant bends', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ];
      const simplified = simplifyPoints(points, 1);
      expect(simplified.length).toBe(3);
    });

    it('returns original array when 2 or fewer points', () => {
      const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
      const simplified = simplifyPoints(points, 1);
      expect(simplified.length).toBe(2);
    });
  });
});
