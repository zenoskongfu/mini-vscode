import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useService } from '../../platform/ServicesContext'
import { useEvent } from '../../platform/useEvent'
import { IQuickInputService } from '../../services/quickinput/quickInputService'
import { ICommandService, type ICommand } from '../../services/commands/commandService'
import { IKeybindingService } from '../../services/keybinding/keybindingService'
import { fuzzyMatch } from '../../base/fuzzy'
import './CommandPalette.css'

interface ScoredCommand {
  command: ICommand
  indices: number[]
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

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 打开时重置 query 并聚焦
  useEffect(() => {
    if (visible) {
      setQuery('')
      setSelected(0)
      // 元素显示后再聚焦
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible])

  // 按模糊匹配分数过滤并排序命令
  const results = useMemo<ScoredCommand[]>(() => {
    const commands = commandService.getCommands()
    if (!query) {
      return commands
        .slice()
        .sort((a, b) => label(a).localeCompare(label(b)))
        .map(command => ({ command, indices: [] }))
    }
    const scored: { command: ICommand; score: number; indices: number[] }[] = []
    for (const command of commands) {
      const match = fuzzyMatch(query, label(command))
      if (match) scored.push({ command, score: match.score, indices: match.indices })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => ({ command: s.command, indices: s.indices }))
  }, [query, commandService])

  // 保持选中项不越界
  useEffect(() => {
    setSelected(s => Math.min(s, Math.max(0, results.length - 1)))
  }, [results.length])

  // 将选中项滚动到可视区域
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const execute = useCallback((command: ICommand) => {
    quickInput.hide()
    commandService.executeCommand(command.id)
  }, [quickInput, commandService])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[selected]
      if (item) execute(item.command)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      quickInput.hide()
    }
  }, [results, selected, execute, quickInput])

  if (!visible) return null

  return (
    <div className="command-palette__overlay" onMouseDown={() => quickInput.hide()}>
      <div className="command-palette" onMouseDown={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette__input"
          placeholder="Type a command…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette__list" ref={listRef}>
          {results.length === 0 && (
            <div className="command-palette__empty">No matching commands</div>
          )}
          {results.map((item, i) => (
            <div
              key={item.command.id}
              className={`command-palette__item ${i === selected ? 'command-palette__item--selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => execute(item.command)}
            >
              <span className="command-palette__item-label">
                {item.command.category && (
                  <span className="command-palette__category">{item.command.category}: </span>
                )}
                <Highlighted
                  text={item.command.title}
                  // 索引基于完整 label（category: title）；这里平移到 title
                  indices={shiftIndicesToTitle(item, item.command)}
                />
              </span>
              {keybindingService.lookupKeybinding(item.command.id) && (
                <span className="command-palette__keybinding">
                  {keybindingService.lookupKeybinding(item.command.id)}
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

/** 将 label 空间中的命中索引转换到 title 空间 */
function shiftIndicesToTitle(item: ScoredCommand, command: ICommand): number[] {
  if (!command.category) return item.indices
  const offset = command.category.length + 2 // "category: "
  return item.indices.map(i => i - offset).filter(i => i >= 0)
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
