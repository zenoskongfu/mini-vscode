import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Event } from "../base/event";

/**
 * Subscribe a React component to one or more service Emitter events.
 *
 * `getValue` reads the current value from the service; the component re-renders
 * whenever any of the given events fire AND the returned value changes by
 * reference. This is the read-side of VSCode's service→view reactivity, adapted
 * to React via useSyncExternalStore.
 *
 * IMPORTANT: `getValue` should return a referentially-stable value when nothing
 * changed (e.g. the service's own array/object field), to avoid render loops.
 */
export function useEvent<T>(event: Event<unknown> | Event<unknown>[], getValue: () => T): T {
	// Keep a stable reference to the events array across renders
	const eventsRef = useRef(event);
	eventsRef.current = event;

	const subscribe = useCallback((onStoreChange: () => void) => {
		const events = Array.isArray(eventsRef.current) ? eventsRef.current : [eventsRef.current];
		// 每次有状态发生变化，events就会被调用，并且入一个触发组件渲染的函数
		const disposables = events.map((e) => e(() => onStoreChange()));
		return () => disposables.forEach((d) => d.dispose());
	}, []);

	return useSyncExternalStore(subscribe, getValue);
}
