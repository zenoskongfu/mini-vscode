/**
 * Proxy identifiers + RPC interface shapes shared by both ends.
 *
 * MainContext.* live in the RENDERER (the "main thread" side, like VSCode's
 * MainThread* classes). ExtHostContext.* live in the ext host process.
 * Method names use the `$` convention.
 */

/** A contributed command from a manifest's `contributes.commands` */
export interface ContributedCommand {
  command: string
  title: string
  category?: string
}

/** Subset of an extension manifest the workbench cares about */
export interface ExtensionDescription {
  id: string
  name: string
  displayName?: string
  main?: string
  activationEvents: string[]
  contributes: {
    commands?: ContributedCommand[]
  }
  extensionPath: string
}

// ── MainThread side (implemented in the renderer, called by the ext host) ──

export interface MainThreadCommandsShape {
  /** The ext host registered a command handler (so the workbench knows it's live) */
  $registerCommand(id: string): void
  /** The ext called `vscode.commands.executeCommand` → run it in the workbench */
  $executeCommand(id: string, args: unknown[]): Promise<unknown>
}

export interface MainThreadMessageShape {
  $showMessage(severity: 'info' | 'warning' | 'error', message: string): Promise<void>
}

// ── ExtHost side (implemented in the ext host, called by the renderer) ──

export interface ExtHostExtensionServiceShape {
  /** Return all discovered extension manifests */
  $getExtensions(): Promise<ExtensionDescription[]>
  /** Activate any extension whose activationEvents include `event` */
  $activateByEvent(event: string): Promise<void>
  /** Re-read the extensions dir (after install/uninstall) */
  $rescan(): Promise<ExtensionDescription[]>
  /** Tell the host which extensions are disabled (skip activation) */
  $setDisabledExtensions(ids: string[]): Promise<void>
}

export interface ExtHostCommandsShape {
  /** Invoke a command handler registered by an extension */
  $executeContributedCommand(id: string, args: unknown[]): Promise<unknown>
}

export const MainContext = {
  MainThreadCommands: 'MainThreadCommands',
  MainThreadMessageService: 'MainThreadMessageService'
} as const

export const ExtHostContext = {
  ExtHostExtensionService: 'ExtHostExtensionService',
  ExtHostCommands: 'ExtHostCommands'
} as const
