import React, { useState, useRef, useEffect, useCallback } from "react";
import type { FileNode } from "../../types/file-tree";
import { ContextMenu, type ContextMenuEntry } from "../context-menu/ContextMenu";
import { FileTree } from "./FileTree";
import "./FileTreeNode.css";
import { ITerminalService } from "@renderer/services/terminal/terminalService";
import { ILayoutService } from "@renderer/services/layout/layoutService";
import { useService } from "@renderer/platform/ServicesContext";

interface FileTreeNodeProps {
	node: FileNode;
	depth: number;
	onOpenFile: (path: string) => void;
	onRefreshParent: () => void;
}

export function FileTreeNode({ node, depth, onOpenFile, onRefreshParent }: FileTreeNodeProps): React.JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(node.name);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);
	const terminalService = useService(ITerminalService);
	const layoutService = useService(ILayoutService);

	// 在 `dir` 打开终端，并确保面板可见（否则新终端会在
	// 面板隐藏时被不可见地创建）。
	const openInTerminal = useCallback(
		(dir: string): void => {
			layoutService.setPanelVisible(true);
			terminalService.createTerminal(dir);
		},
		[layoutService, terminalService]
	);

	// 重命名输入框出现时聚焦
	useEffect(() => {
		if (renaming) {
			renameInputRef.current?.focus();
			renameInputRef.current?.select();
		}
	}, [renaming]);

	const handleClick = useCallback((): void => {
		if (node.isDirectory) {
			setExpanded((e) => !e);
		} else {
			onOpenFile(node.path);
		}
	}, [node, onOpenFile]);

	const handleContextMenu = useCallback((e: React.MouseEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY });
	}, []);

	// ── 文件操作 ──────────────────────────────────────────

	const handleNewFile = useCallback(async (): Promise<void> => {
		const name = "untitled";
		const newPath = `${node.isDirectory ? node.path : node.path.substring(0, node.path.lastIndexOf("/"))}/${name}`;
		await window.electronAPI.fs.createFile(newPath);
		if (node.isDirectory) setExpanded(true);
		onRefreshParent();
	}, [node, onRefreshParent]);

	const handleNewFolder = useCallback(async (): Promise<void> => {
		const base = node.isDirectory ? node.path : node.path.substring(0, node.path.lastIndexOf("/"));
		await window.electronAPI.fs.createDir(`${base}/New Folder`);
		if (node.isDirectory) setExpanded(true);
		onRefreshParent();
	}, [node, onRefreshParent]);

	const handleRenameCommit = useCallback(async (): Promise<void> => {
		const newName = renameValue.trim();
		if (!newName || newName === node.name) {
			setRenaming(false);
			return;
		}
		const dir = node.path.substring(0, node.path.lastIndexOf("/"));
		const newPath = `${dir}/${newName}`;
		await window.electronAPI.fs.rename(node.path, newPath);
		setRenaming(false);
		onRefreshParent();
	}, [renameValue, node, onRefreshParent]);

	const handleDelete = useCallback(async (): Promise<void> => {
		const confirmed = await window.electronAPI.dialog.showMessage({
			type: "warning",
			message: `Delete "${node.name}"?`,
			detail: node.isDirectory ? "This will delete the folder and all its contents." : undefined,
			buttons: ["Delete", "Cancel"],
			defaultId: 1,
			cancelId: 1,
		});
		if (confirmed === 0) {
			await window.electronAPI.fs.delete(node.path);
			onRefreshParent();
		}
	}, [node, onRefreshParent]);

	// ── 上下文菜单项 ───────────────────────────────────────

	const menuItems: ContextMenuEntry[] = node.isDirectory
		? [
				{ label: "New File", onClick: handleNewFile },
				{ label: "New Folder", onClick: handleNewFolder },
				{ separator: true },
				{
					label: "Rename",
					onClick: () => {
						setRenaming(true);
						setRenameValue(node.name);
					},
				},
				{ label: "Delete", onClick: handleDelete, danger: true },
				{ label: "Open in Terminal", onClick: () => openInTerminal(node.path) },
		  ]
		: [
				{
					label: "Rename",
					onClick: () => {
						setRenaming(true);
						setRenameValue(node.name);
					},
				},
				{ label: "Delete", onClick: handleDelete, danger: true },
				{
					label: "Open in Terminal",
					onClick: () => openInTerminal(node.path.substring(0, node.path.lastIndexOf("/"))),
				},
		  ];

	// ── 渲染 ───────────────────────────────────────────────────

	const indent = depth * 12 + 8; // 每层 12px + 8px 基础 padding

	return (
		<div className='file-tree-node'>
			<div
				className={`file-tree-node__row ${node.isDirectory ? "" : "file-tree-node__row--file"}`}
				style={{ paddingLeft: indent }}
				onClick={handleClick}
				onContextMenu={handleContextMenu}
				title={node.path}>
				{/* 目录展开/收起箭头 */}
				<span className={`file-tree-node__arrow ${node.isDirectory ? "" : "file-tree-node__arrow--hidden"}`}>
					{node.isDirectory && (expanded ? <ArrowDownIcon /> : <ArrowRightIcon />)}
				</span>

				{/* 文件/文件夹图标 */}
				<span className='file-tree-node__icon'>
					{node.isDirectory ? expanded ? <FolderOpenIcon /> : <FolderIcon /> : <FileIcon name={node.name} />}
				</span>

				{/* 名称，或内联重命名输入框 */}
				{renaming ? (
					<input
						ref={renameInputRef}
						className='file-tree-node__rename-input'
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleRenameCommit();
							if (e.key === "Escape") setRenaming(false);
						}}
						onBlur={handleRenameCommit}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span className='file-tree-node__name'>{node.name}</span>
				)}
			</div>

			{/* 递归子节点 */}
			{node.isDirectory && expanded && <FileTree dirPath={node.path} depth={depth + 1} onOpenFile={onOpenFile} />}

			{/* 上下文菜单 portal */}
			{contextMenu && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={menuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}

// ── 内联 SVG 图标 ─────────────────────────────────────────

function ArrowRightIcon(): React.JSX.Element {
	return (
		<svg width='10' height='10' viewBox='0 0 10 10' fill='currentColor'>
			<path d='M3 2l4 3-4 3V2z' />
		</svg>
	);
}

function ArrowDownIcon(): React.JSX.Element {
	return (
		<svg width='10' height='10' viewBox='0 0 10 10' fill='currentColor'>
			<path d='M2 3l3 4 3-4H2z' />
		</svg>
	);
}

function FolderIcon(): React.JSX.Element {
	return (
		<svg width='16' height='16' viewBox='0 0 16 16' fill='none'>
			<path
				d='M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H13.5C14.33 4 15 4.67 15 5.5v7c0 .83-.67 1.5-1.5 1.5h-11C1.67 14 1 13.33 1 12.5v-9z'
				fill='#dcb67a'
			/>
		</svg>
	);
}

function FolderOpenIcon(): React.JSX.Element {
	return (
		<svg width='16' height='16' viewBox='0 0 16 16' fill='none'>
			<path d='M1 3.5C1 2.67 1.67 2 2.5 2H6l1.5 2H13.5C14.33 4 15 4.67 15 5.5V7H1V3.5z' fill='#dcb67a' />
			<path d='M1 7h14l-1.5 7h-11L1 7z' fill='#e8c47e' />
		</svg>
	);
}

/** 根据扩展名显示不同颜色的文件图标 */
function FileIcon({ name }: { name: string }): React.JSX.Element {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const color = FILE_COLORS[ext] ?? "#cccccc";
	return (
		<svg width='16' height='16' viewBox='0 0 16 16' fill='none'>
			<path d='M4 1h6l4 4v10H4V1z' fill={color} opacity='0.85' />
			<path d='M10 1l4 4h-4V1z' fill={color} opacity='0.5' />
		</svg>
	);
}

const FILE_COLORS: Record<string, string> = {
	ts: "#3178c6",
	tsx: "#3178c6",
	js: "#f0db4f",
	jsx: "#f0db4f",
	json: "#f0db4f",
	css: "#42a5f5",
	scss: "#c06",
	html: "#e44d26",
	md: "#ffffff",
	py: "#3572a5",
	rs: "#dea584",
	go: "#00acd7",
	sh: "#89e051",
	yml: "#cb171e",
	yaml: "#cb171e",
	gitignore: "#f54d27",
	env: "#ecd53f",
	svg: "#ffb13b",
	png: "#a074c4",
	jpg: "#a074c4",
	jpeg: "#a074c4",
	gif: "#a074c4",
};
