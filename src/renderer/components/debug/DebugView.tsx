import React, { useEffect, useReducer, useState } from 'react'
import { useService } from '../../platform/ServicesContext'
import { IDebugService, type Scope, type Variable } from '../../services/debug/debugService'
import './DebugView.css'

/**
 * Run and Debug 侧边视图（Phase 14 最小闭环）：
 * 控制条（启动/继续/单步/停止）+ 调用栈 + 变量树（懒展开）。
 * 全部从 IDebugService 投影；`onDidChangeState` 触发重渲染。
 */
export function DebugView(): React.JSX.Element {
  const debug = useService(IDebugService)
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const d = debug.onDidChangeState(() => force())
    return () => d.dispose()
  }, [debug])

  const status = debug.status
  const stack = debug.callStack

  return (
    <div className="debug-view">
      <div className="debug-toolbar">
        {status === 'inactive' ? (
          <button className="debug-btn debug-btn--start" title="Start Debugging (F5)" onClick={() => debug.start()}>
            ▶ Start
          </button>
        ) : (
          <>
            <button className="debug-btn" title="Continue (F5)" disabled={status !== 'stopped'} onClick={() => debug.continue()}>▶</button>
            <button className="debug-btn" title="Step Over (F10)" disabled={status !== 'stopped'} onClick={() => debug.next()}>⤼</button>
            <button className="debug-btn" title="Step Into (F11)" disabled={status !== 'stopped'} onClick={() => debug.stepIn()}>⤳</button>
            <button className="debug-btn" title="Step Out" disabled={status !== 'stopped'} onClick={() => debug.stepOut()}>⤴</button>
            <button className="debug-btn debug-btn--stop" title="Stop (Shift+F5)" onClick={() => debug.stop()}>■</button>
          </>
        )}
        <span className="debug-toolbar__spacer" />
        {debug.activeSessionLabel ? (
          <span className="debug-session" title={debug.activeSessionLabel}>
            {debug.activeSessionLabel}
          </span>
        ) : null}
        <span className="debug-status">{status}</span>
      </div>

      <Section title="CALL STACK">
        {stack.length === 0 ? (
          <Empty text="Not paused" />
        ) : (
          stack.map(f => (
            <div
              key={f.id}
              className={`debug-frame ${f.id === debug.activeFrameId ? 'debug-frame--active' : ''}`}
              onClick={() => debug.setActiveFrame(f.id)}
            >
              <span className="debug-frame__name">{f.name}</span>
              <span className="debug-frame__loc">
                {f.source?.name ?? ''}:{f.line}
              </span>
            </div>
          ))
        )}
      </Section>

      <Section title="VARIABLES">
        {status === 'stopped' && debug.activeFrameId != null ? (
          <ScopesPanel key={debug.activeFrameId} frameId={debug.activeFrameId} service={debug} />
        ) : (
          <Empty text="Not paused" />
        )}
      </Section>

      <Section title="WATCH">
        <WatchPanel service={debug} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="debug-section">
      <div className="debug-section__title">{title}</div>
      <div className="debug-section__body">{children}</div>
    </div>
  )
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return <div className="debug-empty">{text}</div>
}

function WatchPanel({ service }: { service: IDebugService }): React.JSX.Element {
  const [input, setInput] = useState('')
  const [items, setItems] = useState<Array<{ expression: string; value: string }>>([])

  const add = (e: React.FormEvent): void => {
    e.preventDefault()
    const expression = input.trim()
    if (!expression) return
    setInput('')
    service.evaluate(expression, 'watch')
      .then(v => setItems(current => [...current, { expression, value: v.value }]))
      .catch(err => setItems(current => [...current, { expression, value: err instanceof Error ? err.message : String(err) }]))
  }

  return (
    <div className="debug-watch">
      {items.length === 0 ? <Empty text="No watch expressions" /> : null}
      {items.map((item, i) => (
        <div className="debug-watch__item" key={item.expression + i}>
          <span className="debug-watch__expr">{item.expression}</span>
          <span className="debug-watch__value">{item.value}</span>
        </div>
      ))}
      <form className="debug-inline-form" onSubmit={add}>
        <input
          className="debug-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Expression"
        />
      </form>
    </div>
  )
}

function ScopesPanel({ frameId, service }: { frameId: number; service: IDebugService }): React.JSX.Element {
  const [scopes, setScopes] = useState<Scope[]>([])
  useEffect(() => {
    let on = true
    service.getScopes(frameId).then(s => {
      if (on) setScopes(s)
    })
    return () => {
      on = false
    }
  }, [frameId, service])
  return (
    <>
      {scopes.map(s => (
        <VarNode
          key={s.variablesReference}
          name={s.name}
          value=""
          reference={s.variablesReference}
          service={service}
          defaultOpen
        />
      ))}
    </>
  )
}

function VarNode({
  name,
  value,
  reference,
  service,
  depth = 0,
  defaultOpen = false
}: {
  name: string
  value: string
  reference: number
  service: IDebugService
  depth?: number
  defaultOpen?: boolean
}): React.JSX.Element {
  const expandable = reference > 0
  const [open, setOpen] = useState(defaultOpen)
  const [children, setChildren] = useState<Variable[] | null>(null)

  useEffect(() => {
    if (!open || !expandable || children !== null) return
    let on = true
    service.getVariables(reference).then(v => {
      if (on) setChildren(v)
    })
    return () => {
      on = false
    }
  }, [open, expandable, children, reference, service])

  return (
    <div>
      <div
        className="debug-var"
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => expandable && setOpen(o => !o)}
      >
        <span className="debug-var__twist">{expandable ? (open ? '▾' : '▸') : ''}</span>
        <span className="debug-var__name">{name}</span>
        {value ? <span className="debug-var__value">{value}</span> : null}
      </div>
      {open &&
        children?.map((c, i) => (
          <VarNode
            key={c.name + i}
            name={c.name}
            value={c.value}
            reference={c.variablesReference}
            service={service}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}
