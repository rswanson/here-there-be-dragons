import { create } from 'zustand';
import type { Drawing } from '../types/Drawing';

const MAX_UNDO_STACK = 50;

function boundStack<T>(stack: T[]): T[] {
  return stack.length > MAX_UNDO_STACK ? stack.slice(stack.length - MAX_UNDO_STACK) : stack;
}

interface UndoEntry {
  layerId: string;
  action: 'add' | 'remove';
  drawing: Drawing;
}

interface DrawingState {
  drawings: Drawing[];
  undoStacks: Record<string, UndoEntry[]>;
  redoStacks: Record<string, UndoEntry[]>;

  loadDrawings: (drawings: Drawing[]) => void;
  addDrawing: (drawing: Drawing) => void;
  removeDrawing: (drawingId: string) => void;
  updateDrawing: (drawingId: string, patch: Partial<Drawing>) => void;

  undo: (layerId: string) => void;
  redo: (layerId: string) => void;
}

const initialState = {
  drawings: [] as Drawing[],
  undoStacks: {} as Record<string, UndoEntry[]>,
  redoStacks: {} as Record<string, UndoEntry[]>,
};

export const useDrawingStore = create<DrawingState>()((set) => ({
  ...initialState,

  loadDrawings: (drawings) =>
    set({ drawings, undoStacks: {}, redoStacks: {} }),

  addDrawing: (drawing) =>
    set((s) => {
      if (s.drawings.some((d) => d.id === drawing.id)) return s;
      const layerId = drawing.layer_id;
      const undoStack = boundStack([
        ...(s.undoStacks[layerId] ?? []),
        { layerId, action: 'add' as const, drawing },
      ]);
      return {
        drawings: [...s.drawings, drawing],
        undoStacks: { ...s.undoStacks, [layerId]: undoStack },
        redoStacks: { ...s.redoStacks, [layerId]: [] },
      };
    }),

  removeDrawing: (drawingId) =>
    set((s) => {
      const drawing = s.drawings.find((d) => d.id === drawingId);
      if (!drawing) return s;
      const layerId = drawing.layer_id;
      const undoStack = boundStack([
        ...(s.undoStacks[layerId] ?? []),
        { layerId, action: 'remove' as const, drawing },
      ]);
      return {
        drawings: s.drawings.filter((d) => d.id !== drawingId),
        undoStacks: { ...s.undoStacks, [layerId]: undoStack },
        redoStacks: { ...s.redoStacks, [layerId]: [] },
      };
    }),

  updateDrawing: (drawingId, patch) =>
    set((s) => {
      const original = s.drawings.find((d) => d.id === drawingId);
      if (!original) return s;
      const layerId = original.layer_id;
      const undoStack = boundStack([
        ...(s.undoStacks[layerId] ?? []),
        { layerId, action: 'remove' as const, drawing: original },
      ]);
      const updated = { ...original, ...patch };
      return {
        drawings: s.drawings.map((d) => (d.id === drawingId ? updated : d)),
        undoStacks: { ...s.undoStacks, [layerId]: undoStack },
        redoStacks: { ...s.redoStacks, [layerId]: [] },
      };
    }),

  undo: (layerId) =>
    set((s) => {
      const stack = s.undoStacks[layerId] ?? [];
      if (stack.length === 0) return s;

      const entry = stack[stack.length - 1];
      const newUndo = stack.slice(0, -1);
      const newRedo = boundStack([...(s.redoStacks[layerId] ?? []), entry]);

      let drawings: Drawing[];
      if (entry.action === 'add') {
        drawings = s.drawings.filter((d) => d.id !== entry.drawing.id);
      } else {
        drawings = [...s.drawings, entry.drawing];
      }

      return {
        drawings,
        undoStacks: { ...s.undoStacks, [layerId]: newUndo },
        redoStacks: { ...s.redoStacks, [layerId]: newRedo },
      };
    }),

  redo: (layerId) =>
    set((s) => {
      const stack = s.redoStacks[layerId] ?? [];
      if (stack.length === 0) return s;

      const entry = stack[stack.length - 1];
      const newRedo = stack.slice(0, -1);
      const newUndo = boundStack([...(s.undoStacks[layerId] ?? []), entry]);

      let drawings: Drawing[];
      if (entry.action === 'add') {
        drawings = [...s.drawings, entry.drawing];
      } else {
        drawings = s.drawings.filter((d) => d.id !== entry.drawing.id);
      }

      return {
        drawings,
        undoStacks: { ...s.undoStacks, [layerId]: newUndo },
        redoStacks: { ...s.redoStacks, [layerId]: newRedo },
      };
    }),
}));
