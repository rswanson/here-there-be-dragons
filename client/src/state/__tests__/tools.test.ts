import { describe, it, expect, beforeEach } from 'vitest'
import { useToolStore } from '../tools'

describe('useToolStore', () => {
  beforeEach(() => {
    useToolStore.setState(useToolStore.getInitialState())
  })

  it('starts with select tool', () => {
    expect(useToolStore.getState().activeTool).toBe('select')
  })

  it('switches tool', () => {
    useToolStore.getState().setTool('freehand')
    expect(useToolStore.getState().activeTool).toBe('freehand')
  })

  it('updates draw settings', () => {
    useToolStore.getState().setDrawSettings({ strokeColor: '#ff0000', strokeWidth: 5 })
    const { drawSettings } = useToolStore.getState()
    expect(drawSettings.strokeColor).toBe('#ff0000')
    expect(drawSettings.strokeWidth).toBe(5)
  })
})
