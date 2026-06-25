import React, { useState, useEffect } from "react";
import { useService } from "../platform/ServicesContext";
import { useEvent } from "../platform/useEvent";
import { ITerminalService } from "../services/terminal/terminalService";
import {
	IDiagnosticsService,
	type IDiagnosticItem,
	type DiagnosticSeverity,
} from "../services/diagnostics/diagnosticsService";
import { IEditorService } from "../services/editor/editorService";
import { TerminalView } from "../components/terminal/TerminalView";
import "./Panel.css";

interface PanelProps {
	className?: string;
}

type PanelTab = "terminal" | "problems" | "output";

/**
 * 底部面板容器。
 * 承载 Terminal（真实 pty + xterm）、Problems、Output 标签。
 */
export function Panel({ className = "" }: PanelProps): React.JSX.Element {
	const [activeTab, setActiveTab] = useState<PanelTab>("terminal");

	// 实时诊断数量（驱动 PROBLEMS 标签徽标）
	const diagnostics = useService(IDiagnosticsService);
	const counts = useEvent(diagnostics.onDidChangeDiagnostics, () => diagnostics.getCounts());

	const tabs: { id: PanelTab; label: string; badge?: number }[] = [
		{ id: "terminal", label: "TERMINAL" },
		{ id: "problems", label: "PROBLEMS", badge: counts.total },
		{ id: "output", label: "OUTPUT" },
	];

	return (
		<div className={`panel ${className}`}>
			{/* 标签栏 */}
			<div className='panel__tabs'>
				{tabs.map((tab) => (
					<button
						key={tab.id}
						className={`panel__tab ${activeTab === tab.id ? "panel__tab--active" : ""}`}
						onClick={() => setActiveTab(tab.id)}>
						{tab.label}
						{tab.badge !== undefined && tab.badge > 0 && (
							<span className='panel__tab-badge'>{tab.badge}</span>
						)}
					</button>
				))}
			</div>

			{/* 内容：保持终端挂载（非活动时 display:none），这样
          切换标签时 shell 会话不会丢失 */}
			<div className='panel__content'>
				<div className='panel__pane' style={{ display: activeTab === "terminal" ? "block" : "none" }}>
					<TerminalPane active={activeTab === "terminal"} />
				</div>

				{activeTab === "problems" && <ProblemsPane />}
				{activeTab === "output" && (
					<div className='panel-placeholder'>
						<span className='panel-placeholder__text'>Output channel — available in Phase 9</span>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Problems 面板（Phase 13.1）：汇总 Monaco markers（内置 TS/JS 诊断等），
 * 点击一条跳转到对应文件的行列。
 */
function ProblemsPane(): React.JSX.Element {
	const diagnostics = useService(IDiagnosticsService);
	const editorService = useService(IEditorService);
	const problems = useEvent(diagnostics.onDidChangeDiagnostics, () => diagnostics.getProblems());

	if (problems.length === 0) {
		return (
			<div className='panel-placeholder'>
				<span className='panel-placeholder__text'>No problems detected.</span>
			</div>
		);
	}

	return (
		<div className='problems-list'>
			{problems.map((p, i) => (
				<button
					key={`${p.path}:${p.line}:${p.column}:${i}`}
					className='problems-item'
					title={p.message}
					onClick={() => editorService.revealPosition(p.path, p.line, p.column)}>
					<span className='problems-item__icon' style={{ color: severityColor(p.severity) }}>
						{severityGlyph(p.severity)}
					</span>
					<span className='problems-item__message'>{p.message}</span>
					<span className='problems-item__location'>
						{p.fileName} [{p.line}:{p.column}]
					</span>
				</button>
			))}
		</div>
	);
}

function severityGlyph(s: DiagnosticSeverity): string {
	return s === "error" ? "✖" : s === "warning" ? "⚠" : s === "info" ? "ⓘ" : "·";
}

function severityColor(s: DiagnosticSeverity): string {
	return s === "error"
		? "var(--color-error)"
		: s === "warning"
			? "var(--color-warning)"
			: "var(--color-info)";
}

/**
 * 第一次显示终端标签页时懒创建一个终端，
 * 然后渲染对应的 xterm 视图。
 */
function TerminalPane({ active }: { active: boolean }): React.JSX.Element {
	const terminalService = useService(ITerminalService);
	const terminals = useEvent(terminalService.onDidChangeTerminals, () => terminalService.terminals);
	const activeId = useEvent(terminalService.onDidChangeTerminals, () => terminalService.activeId);

	// 首次显示时创建第一个终端。cwd 策略（工作区根目录）
	// 位于 TerminalService 内部，因此调用方无需传入。
	useEffect(() => {
		if (active && terminalService.terminals.length === 0) {
			terminalService.createTerminal();
		}
	}, [active, terminalService]);

	if (terminals.length === 0) {
		return (
			<div className='panel-placeholder'>
				<span className='panel-placeholder__text'>Starting terminal…</span>
			</div>
		);
	}

	return (
		<div className='panel__terminal-wrap'>
			{/* 终端工具栏：选择器（切换）+ 新建 + 关闭 */}
			<div className='terminal-toolbar'>
				<div className='terminal-toolbar__selector'>
					{terminals.map((t) => (
						<button
							key={t.id}
							className={`terminal-toolbar__item ${
								t.id === activeId ? "terminal-toolbar__item--active" : ""
							}`}
							onClick={() => terminalService.setActive(t.id)}
							title={t.title}>
							<TerminalIcon />
							<span className='terminal-toolbar__item-label'>{t.title}</span>
						</button>
					))}
				</div>
				<div className='terminal-toolbar__actions'>
					<button
						className='terminal-toolbar__action'
						title='New Terminal'
						onClick={() => terminalService.createTerminal()}>
						<PlusIcon />
					</button>
					<button
						className='terminal-toolbar__action'
						title='Kill Terminal'
						onClick={() => {
							if (activeId) terminalService.closeTerminal(activeId);
						}}>
						<TrashIcon />
					</button>
				</div>
			</div>

			{/* 挂载所有终端；只显示当前活动终端 */}
			<div className='panel__terminal-views'>
				{terminals.map((t) => (
					<div
						key={t.id}
						className='panel__terminal-slot'
						style={{ display: t.id === activeId ? "block" : "none" }}>
						<TerminalView id={t.id} />
					</div>
				))}
			</div>
		</div>
	);
}

function TerminalIcon(): React.JSX.Element {
	return (
		<svg
			width='14'
			height='14'
			viewBox='0 0 16 16'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.3'
			strokeLinecap='round'
			strokeLinejoin='round'>
			<rect x='2' y='3' width='12' height='10' rx='1.5' />
			<path d='M5 6.5l2 1.5-2 1.5' />
			<path d='M8.5 10h2.5' />
		</svg>
	);
}

function PlusIcon(): React.JSX.Element {
	return (
		<svg
			width='16'
			height='16'
			viewBox='0 0 16 16'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.4'
			strokeLinecap='round'>
			<path d='M8 3.5v9M3.5 8h9' />
		</svg>
	);
}

function TrashIcon(): React.JSX.Element {
	return (
		<svg
			width='16'
			height='16'
			viewBox='0 0 16 16'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.3'
			strokeLinecap='round'
			strokeLinejoin='round'>
			<path d='M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8' />
		</svg>
	);
}
