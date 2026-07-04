import React, { useEffect, useReducer, useState } from 'react'
import { useService } from '../../platform/ServicesContext'
import { IDebugService } from '../../services/debug/debugService'
import './DebugConsolePanel.css'

export function DebugConsolePanel(): React.JSX.Element {
  const debug = useService(IDebugService)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [input, setInput] = useState('')

  useEffect(() => {
    const d = debug.onDidChangeState(() => force())
    return () => d.dispose()
  }, [debug])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const expression = input.trim()
    if (!expression) return
    setInput('')
    void debug.evaluate(expression, 'repl')
  }

  return (
    <div className="debug-console-panel">
      <div className="debug-console-panel__entries">
        {debug.consoleEntries.length === 0 ? (
          <div className="debug-console-panel__empty">No output</div>
        ) : (
          debug.consoleEntries.map(entry => (
            <div className={`debug-console-panel__entry debug-console-panel__entry--${entry.kind}`} key={entry.id}>
              {entry.text}
            </div>
          ))
        )}
      </div>
      <form className="debug-console-panel__input-row" onSubmit={submit}>
        <input
          className="debug-console-panel__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Evaluate expression"
        />
        <button className="debug-console-panel__button" title="Clear Console" type="button" onClick={() => debug.clearConsole()}>
          Clear
        </button>
      </form>
    </div>
  )
}
