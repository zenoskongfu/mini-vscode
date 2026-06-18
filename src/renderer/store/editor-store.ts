import { useSyncExternalStore } from 'react'

/** A single open editor tab */
export interface EditorTab {
  path: string
  name: string
  /** Content as loaded from disk (the "saved" baseline) */
  savedContent: string
  /** Live content currently in the editor (preserves unsaved edits across tab switches) */
  content: string
  /** true when content differs from savedContent */
  dirty: boolean
}

interface EditorState {
  tabs: EditorTab[]
  activePath: string | null
}

/**
 * TabService — module-level editor/tab state with a useSyncExternalStore hook.
 * Phase 6 may migrate this to Zustand, but the external-store pattern already
 * lets non-React services read/mutate tab state (mirrors VSCode's IEditorService).
 */
let state: EditorState = { tabs: [], activePath: null }
let listeners: Array<() => void> = []

function emit(): void {
  state = { ...state }            // new reference so useSyncExternalStore re-renders
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener)
  return () => { listeners = listeners.filter(l => l !== listener) }
}

function getSnapshot(): EditorState {
  return state
}

// ── Public API ──────────────────────────────────────────────

/** Open a file in a tab. If already open, just activates it. */
export async function openFileInTab(path: string): Promise<void> {
  const existing = state.tabs.find(t => t.path === path)
  if (existing) {
    state.activePath = path
    emit()
    return
  }

  let content = ''
  try {
    content = await window.electronAPI.fs.readFile(path)
  } catch {
    content = ''
  }

  const tab: EditorTab = {
    path,
    name: path.split('/').pop() ?? path,
    savedContent: content,
    content,
    dirty: false
  }
  state.tabs = [...state.tabs, tab]
  state.activePath = path
  emit()
}

export function activateTab(path: string): void {
  if (state.activePath === path) return
  state.activePath = path
  emit()
}

export function closeTab(path: string): void {
  const idx = state.tabs.findIndex(t => t.path === path)
  if (idx === -1) return

  state.tabs = state.tabs.filter(t => t.path !== path)

  // If we closed the active tab, activate a neighbour
  if (state.activePath === path) {
    const next = state.tabs[idx] ?? state.tabs[idx - 1] ?? null
    state.activePath = next ? next.path : null
  }
  emit()
}

/** Update a tab's live content and recompute its dirty flag */
export function updateTabContent(path: string, currentContent: string): void {
  const tab = state.tabs.find(t => t.path === path)
  if (!tab || tab.content === currentContent) return
  tab.content = currentContent
  tab.dirty = currentContent !== tab.savedContent
  emit()
}

/** Persist a tab's content to disk and reset its dirty state */
export async function saveTab(path: string): Promise<void> {
  const tab = state.tabs.find(t => t.path === path)
  if (!tab) return
  await window.electronAPI.fs.writeFile(path, tab.content)
  tab.savedContent = tab.content
  tab.dirty = false
  emit()
}

// ── React hooks ─────────────────────────────────────────────

export function useEditorState(): EditorState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function getActiveTab(): EditorTab | null {
  return state.tabs.find(t => t.path === state.activePath) ?? null
}
