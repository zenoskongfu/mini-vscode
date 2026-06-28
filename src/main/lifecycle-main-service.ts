import { app, BrowserWindow, type Event as ElectronEvent } from 'electron'

export enum ShutdownReason {
  QUIT = 1,
  KILL = 2
}

export interface ShutdownEvent {
  readonly reason: ShutdownReason
  join(id: string, promise: Promise<unknown>): void
}

type ShutdownListener = (event: ShutdownEvent) => void

/**
 * A tiny main-process lifecycle service modeled after VSCode's
 * LifecycleMainService. It centralizes app shutdown and lets owners of native
 * resources join the final cleanup phase.
 */
export class LifecycleMainService {
  private readonly willShutdownListeners = new Set<ShutdownListener>()
  private pendingWillShutdownPromise: Promise<void> | undefined
  private quitRequested = false
  private didHandleWillQuit = false

  onWillShutdown(listener: ShutdownListener): () => void {
    this.willShutdownListeners.add(listener)
    return () => this.willShutdownListeners.delete(listener)
  }

  registerListeners(): void {
    app.on('before-quit', () => {
      if (this.quitRequested) return
      this.quitRequested = true
    })

    app.once('will-quit', event => {
      this.handleWillQuit(event)
    })

    process.once('SIGINT', () => {
      this.kill(130)
    })

    process.once('SIGTERM', () => {
      this.kill(143)
    })
  }

  fireOnWillShutdown(reason: ShutdownReason): Promise<void> {
    if (this.pendingWillShutdownPromise) {
      return this.pendingWillShutdownPromise
    }

    const joiners: Promise<unknown>[] = []
    const shutdownEvent: ShutdownEvent = {
      reason,
      join(id, promise) {
        joiners.push(
          Promise.resolve(promise).catch(error => {
            console.error(`[main] shutdown participant failed: ${id}`, error)
          })
        )
      }
    }

    console.log('[main] lifecycle onWillShutdown', ShutdownReason[reason])
    for (const listener of [...this.willShutdownListeners]) {
      try {
        listener(shutdownEvent)
      } catch (error) {
        console.error('[main] shutdown listener failed', error)
      }
    }

    this.pendingWillShutdownPromise = Promise.allSettled(joiners).then(() => undefined)
    return this.pendingWillShutdownPromise
  }

  private handleWillQuit(event: ElectronEvent): void {
    if (this.didHandleWillQuit) return
    this.didHandleWillQuit = true

    event.preventDefault()
    this.fireOnWillShutdown(ShutdownReason.QUIT).finally(() => {
      app.quit()
    })
  }

  private kill(exitCode: number): void {
    this.quitRequested = true
    this.fireOnWillShutdown(ShutdownReason.KILL).finally(async () => {
      await Promise.race([this.destroyWindows(), this.timeout(1000)])
      app.exit(exitCode)
    })
  }

  private async destroyWindows(): Promise<void> {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue
      const whenClosed = new Promise<void>(resolve => {
        window.once('closed', () => resolve())
      })
      window.destroy()
      await whenClosed
    }
  }

  private timeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
