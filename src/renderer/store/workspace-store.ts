import { useState, useEffect, useCallback } from "react";
import type { FileNode, FileChangeEvent } from "../types/file-tree";

/**
 * Simple module-level workspace state.
 * Phase 6+ will migrate this to Zustand slices.
 *
 * Using a custom hook so components can subscribe without a provider.
 */

let rootPath: string | null = null;
let listeners: Array<() => void> = [];

function notify(): void {
	listeners.forEach((fn) => fn());
}

export function setWorkspaceRoot(p: string | null): void {
	rootPath = p;
	notify();
}

export function getWorkspaceRoot(): string | null {
	return rootPath;
}

/** Re-renders a component whenever the workspace root changes */
export function useWorkspaceRoot(): string | null {
	const [root, setRoot] = useState<string | null>(rootPath);
	useEffect(() => {
		const handler = (): void => setRoot(rootPath);
		listeners.push(handler);
		return () => {
			listeners = listeners.filter((l) => l !== handler);
		};
	}, []);
	return root;
}

/**
 * Hook: loads children of a directory path on demand.
 * Re-fetches whenever a relevant fs:onChange event arrives.
 */
export function useDirectoryChildren(dirPath: string | null): {
	children: FileNode[];
	loading: boolean;
	reload: () => void;
} {
	const [children, setChildren] = useState<FileNode[]>([]);
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		if (!dirPath) {
			setChildren([]);
			return;
		}
		setLoading(true);
		try {
			const nodes = (await window.electronAPI.fs.readDir(dirPath)) as FileNode[];

			console.log("Loaded children for", dirPath, nodes);
			setChildren(nodes);
		} catch {
			setChildren([]);
		} finally {
			setLoading(false);
		}
	}, [dirPath]);

	useEffect(() => {
		load();
	}, [load]);

	// Listen for file-system changes that affect this directory
	useEffect(() => {
		if (!dirPath) return;
		const cleanup = window.electronAPI.fs.onChange((event: unknown) => {
			const e = event as FileChangeEvent;
			const parent = e.path.substring(0, e.path.lastIndexOf("/"));
			if (parent === dirPath) load();
		});
		return cleanup;
	}, [dirPath, load]);

	return { children, loading, reload: load };
}
