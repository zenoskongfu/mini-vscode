import { createDecorator } from '../../instantiation/instantiation'
import { registerSingleton } from '../../instantiation/extensions'
import { Emitter, Event } from '../../base/event'
import { IStorageService, StorageScope } from '../storage/storageService'

export type ActivityView = 'explorer' | 'search' | 'scm' | 'extensions' | 'settings'

export interface CursorPosition {
  line: number
  column: number
}

export interface ILayoutService {
  readonly _serviceBrand: undefined

  readonly onDidChangeSidebarVisibility: Event<boolean>
  readonly onDidChangePanelVisibility: Event<boolean>
  readonly onDidChangeActiveView: Event<ActivityView>
  readonly onDidChangeCursor: Event<CursorPosition>

  readonly sidebarVisible: boolean
  readonly panelVisible: boolean
  readonly activeView: ActivityView
  readonly cursor: CursorPosition

  toggleSidebar(): void
  togglePanel(): void
  setSidebarVisible(visible: boolean): void
  setPanelVisible(visible: boolean): void
  setActiveView(view: ActivityView): void
  setCursor(cursor: CursorPosition): void
  restore(): void
}

export const ILayoutService = createDecorator<ILayoutService>('layoutService')

const KEY_SIDEBAR = 'layout.sidebarVisible'
const KEY_PANEL = 'layout.panelVisible'
const KEY_VIEW = 'layout.activeView'

/**
 * LayoutService — workbench part visibility + active activity-bar view + cursor.
 * Pane *sizes* are owned by Allotment; this service only tracks visibility/view.
 * Visibility + active view are persisted via IStorageService.
 */
export class LayoutService implements ILayoutService {
  declare readonly _serviceBrand: undefined

  private _sidebarVisible = true
  private _panelVisible = true
  private _activeView: ActivityView = 'explorer'
  private _cursor: CursorPosition = { line: 1, column: 1 }

  private readonly _onDidChangeSidebarVisibility = new Emitter<boolean>()
  readonly onDidChangeSidebarVisibility = this._onDidChangeSidebarVisibility.event

  private readonly _onDidChangePanelVisibility = new Emitter<boolean>()
  readonly onDidChangePanelVisibility = this._onDidChangePanelVisibility.event

  private readonly _onDidChangeActiveView = new Emitter<ActivityView>()
  readonly onDidChangeActiveView = this._onDidChangeActiveView.event

  private readonly _onDidChangeCursor = new Emitter<CursorPosition>()
  readonly onDidChangeCursor = this._onDidChangeCursor.event

  constructor(@IStorageService private readonly storageService: IStorageService) {}

  get sidebarVisible(): boolean { return this._sidebarVisible }
  get panelVisible(): boolean { return this._panelVisible }
  get activeView(): ActivityView { return this._activeView }
  get cursor(): CursorPosition { return this._cursor }

  restore(): void {
    this._sidebarVisible = this.storageService.getBoolean(KEY_SIDEBAR, StorageScope.GLOBAL, true)
    this._panelVisible = this.storageService.getBoolean(KEY_PANEL, StorageScope.GLOBAL, true)
    this._activeView = (this.storageService.get(KEY_VIEW, StorageScope.GLOBAL) as ActivityView) ?? 'explorer'
    // Fire so any already-mounted views pick up restored state
    this._onDidChangeSidebarVisibility.fire(this._sidebarVisible)
    this._onDidChangePanelVisibility.fire(this._panelVisible)
    this._onDidChangeActiveView.fire(this._activeView)
  }

  toggleSidebar(): void {
    this.setSidebarVisible(!this._sidebarVisible)
  }

  togglePanel(): void {
    this.setPanelVisible(!this._panelVisible)
  }

  setSidebarVisible(visible: boolean): void {
    if (this._sidebarVisible === visible) return
    this._sidebarVisible = visible
    this.storageService.store(KEY_SIDEBAR, visible, StorageScope.GLOBAL)
    this._onDidChangeSidebarVisibility.fire(visible)
  }

  setPanelVisible(visible: boolean): void {
    if (this._panelVisible === visible) return
    this._panelVisible = visible
    this.storageService.store(KEY_PANEL, visible, StorageScope.GLOBAL)
    this._onDidChangePanelVisibility.fire(visible)
  }

  setActiveView(view: ActivityView): void {
    if (this._activeView === view) return
    this._activeView = view
    this.storageService.store(KEY_VIEW, view, StorageScope.GLOBAL)
    this._onDidChangeActiveView.fire(view)
  }

  setCursor(cursor: CursorPosition): void {
    this._cursor = cursor
    this._onDidChangeCursor.fire(cursor)
  }
}

registerSingleton(ILayoutService, LayoutService)
