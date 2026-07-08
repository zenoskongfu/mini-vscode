import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { IQuickInputService, type QuickPickItem } from '../../services/quickinput/quickInputService'
import { ICommandService, type ICommand } from '../../services/commands/commandService'
import { IKeybindingService } from '../../services/keybinding/keybindingService'
import { fuzzyMatch } from '../../base/fuzzy'
import './CommandPalette.css'

interface PaletteEntry {
  key: string
  label: string
  category?: string
  description?: string
  keybinding?: string
  indices: number[]
  pickItem?: QuickPickItem
  execute: () => void
}

/**
 * 命令面板覆盖层（Ctrl/Cmd+Shift+P）。
 * 组件始终挂载；可见性由 IQuickInputService 驱动。
 */
export function CommandPalette(): React.JSX.Element | null {
  const quickInput = useService(IQuickInputService)
  const commandService = useService(ICommandService)
  const keybindingService = useService(IKeybindingService)

  const visible = useEvent(quickInput.onDidChangeVisibility, () => quickInput.isVisible)
  const stateVersion = useEvent(quickInput.onDidChange, () => quickInput.stateVersion)
  const commandVersion = useEvent(commandService.onDidRegisterCommand, () => commandService.getCommands().length)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const mode = quickInput.mode
  const pickItems = quickInput.pickItems
  const pickOptions = quickInput.pickOptions

  // 打开或切换 QuickInput 模式时重置 query 并聚焦。
  // 例如从命令搜索进入 Color Theme pick 时，visible 可能被 React 合并为一直 true。
  useEffect(() => {
    if (visible) {
      const initialSelected = mode === 'pick' ? getInitialPickSelectedIndex(pickItems, pickOptions?.activeItemId) : 0
      setQuery('')
      setSelected(initialSelected)
      if (mode === 'pick') quickInput.setActivePickItem(pickItems[initialSelected])
      // 元素显示后再聚焦
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible, mode, pickItems, pickOptions, quickInput])

  // 按模糊匹配分数过滤并排序命令/选择项
  const results = useMemo<PaletteEntry[]>(() => {
    void stateVersion
    void commandVersion
    if (mode === 'pick') {
      return scorePickItems(pickItems, query, item => quickInput.acceptPick(item))
    }

    const commands = commandService.getCommands()
    if (!query) {
      return commands
        .slice()
        .sort((a, b) => label(a).localeCompare(label(b)))
        .map(command => commandToEntry(command, [], quickInput.hide.bind(quickInput), commandService, keybindingService))
    }
    const scored: { command: ICommand; score: number; indices: number[] }[] = []
    for (const command of commands) {
      const match = fuzzyMatch(query, label(command))
      if (match) scored.push({ command, score: match.score, indices: match.indices })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => commandToEntry(s.command, s.indices, quickInput.hide.bind(quickInput), commandService, keybindingService))
  }, [query, mode, stateVersion, commandVersion, quickInput, commandService, keybindingService, pickItems])

  // 保持选中项不越界
  useEffect(() => {
    setSelected(s => clampSelectedIndex(s, results.length))
  }, [results.length])

  // 将选中项滚动到可视区域
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const activateEntry = useCallback((entry: PaletteEntry | undefined) => {
    if (mode !== 'pick') return
    quickInput.setActivePickItem(entry?.pickItem)
  }, [mode, quickInput])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = clampSelectedIndex(selected + 1, results.length)
      setSelected(next)
      activateEntry(results[next])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = clampSelectedIndex(selected - 1, results.length)
      setSelected(next)
      activateEntry(results[next])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[selected]
      item?.execute()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      quickInput.hide()
    }
  }, [results, selected, quickInput, activateEntry])

  if (!visible) return null

  const placeholder = mode === 'pick'
    ? pickOptions?.placeholder ?? 'Select an item…'
    : 'Type a command…'
  const emptyLabel = mode === 'pick' ? 'No matching items' : 'No matching commands'

  return (
    <div className="command-palette__overlay" onMouseDown={() => quickInput.hide()}>
      <div className="command-palette" onMouseDown={e => e.stopPropagation()}>
        {mode === 'pick' && pickOptions?.title && (
          <div className="command-palette__title">{pickOptions.title}</div>
        )}
        <input
          ref={inputRef}
          className="command-palette__input"
          placeholder={placeholder}
          value={query}
          onChange={e => {
            const nextQuery = e.target.value
            setQuery(nextQuery)
            setSelected(0)
            if (mode === 'pick') quickInput.setActivePickItem(getFirstMatchingPickItem(pickItems, nextQuery))
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette__list" ref={listRef}>
          {results.length === 0 && (
            <div className="command-palette__empty">{emptyLabel}</div>
          )}
          {results.map((item, i) => (
            <div
              key={item.key}
              className={`command-palette__item ${i === selected ? 'command-palette__item--selected' : ''}`}
              onMouseEnter={() => {
                setSelected(i)
                activateEntry(item)
              }}
              onClick={() => item.execute()}
            >
              <span className="command-palette__item-label">
                {item.category && (
                  <span className="command-palette__category">{item.category}: </span>
                )}
                <Highlighted
                  text={item.label}
                  indices={item.indices}
                />
                {item.description && (
                  <span className="command-palette__description"> {item.description}</span>
                )}
              </span>
              {item.keybinding && (
                <span className="command-palette__keybinding">
                  {item.keybinding}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function label(command: ICommand): string {
  return command.category ? `${command.category}: ${command.title}` : command.title
}

function commandToEntry(
  command: ICommand,
  indices: number[],
  hide: () => void,
  commandService: ICommandService,
  keybindingService: IKeybindingService
): PaletteEntry {
  return {
    key: command.id,
    label: command.title,
    category: command.category,
    keybinding: keybindingService.lookupKeybinding(command.id),
    // 索引基于完整 label（category: title）；这里平移到 title
    indices: shiftIndicesToTitle(indices, command),
    execute: () => {
      hide()
      commandService.executeCommand(command.id)
    }
  }
}

function scorePickItems(
  items: readonly QuickPickItem[],
  query: string,
  accept: (item: QuickPickItem) => void
): PaletteEntry[] {
  const entries = items.map((item, index) => pickItemToEntry(item, index, [], accept))
  if (!query) return entries

  const scored: { entry: PaletteEntry; score: number }[] = []
  for (const [index, item] of items.entries()) {
    const searchLabel = item.description ? `${item.label} ${item.description}` : item.label
    const match = fuzzyMatch(query, searchLabel)
    if (match) scored.push({ entry: pickItemToEntry(item, index, match.indices, accept), score: match.score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.entry)
}

function pickItemToEntry(
  item: QuickPickItem,
  index: number,
  indices: number[],
  accept: (item: QuickPickItem) => void
): PaletteEntry {
  return {
    key: item.id ?? `${item.label}-${index}`,
    label: item.label,
    description: item.description,
    indices: indices.filter(i => i < item.label.length),
    pickItem: item,
    execute: () => accept(item)
  }
}

function getInitialPickSelectedIndex(items: readonly QuickPickItem[], activeItemId: string | undefined): number {
  if (!activeItemId) return 0
  const index = items.findIndex(item => item.id === activeItemId)
  return index >= 0 ? index : 0
}

function clampSelectedIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

function getFirstMatchingPickItem(items: readonly QuickPickItem[], query: string): QuickPickItem | undefined {
  if (!query) return items[0]
  const scored: { item: QuickPickItem; score: number }[] = []
  for (const item of items) {
    const searchLabel = item.description ? `${item.label} ${item.description}` : item.label
    const match = fuzzyMatch(query, searchLabel)
    if (match) scored.push({ item, score: match.score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.item
}

/** 将 label 空间中的命中索引转换到 title 空间 */
function shiftIndicesToTitle(indices: number[], command: ICommand): number[] {
  if (!command.category) return indices
  const offset = command.category.length + 2 // "category: "
  return indices.map(i => i - offset).filter(i => i >= 0)
}

function Highlighted({ text, indices }: { text: string; indices: number[] }): React.JSX.Element {
  if (indices.length === 0) return <>{text}</>
  const set = new Set(indices)
  return (
    <>
      {text.split('').map((ch, i) =>
        set.has(i) ? <mark key={i} className="command-palette__match">{ch}</mark> : ch
      )}
    </>
  )
}
