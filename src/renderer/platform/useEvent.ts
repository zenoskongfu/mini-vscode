import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Event } from "../base/event";

/**
 * 让 React 组件订阅一个或多个服务 Emitter 事件。
 *
 * `getValue` 从服务读取当前值；当任意事件触发，且返回值引用发生变化时，组件会重新渲染。
 * 这是 VSCode 服务→视图响应式读侧在 React/useSyncExternalStore 上的适配。
 *
 * 重要：未发生真实变化时，`getValue` 应返回引用稳定的值
 *（例如服务自己的数组/对象字段），避免渲染循环。
 */
export function useEvent<T>(event: Event<unknown> | Event<unknown>[], getValue: () => T): T {
	// 在多次 render 之间保持 events 数组引用稳定
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
