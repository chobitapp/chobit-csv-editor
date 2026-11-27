export interface HistoryState<T> {
	past: T[];
	present: T;
	future: T[];
}

export function createHistory<T>(present: T): HistoryState<T> {
	return { past: [], present, future: [] };
}

export function commit<T>(history: HistoryState<T>, next: T, limit: number): HistoryState<T> {
	if (next === history.present) return history;
	const past = [...history.past, history.present];
	if (past.length > limit) past.splice(0, past.length - limit);
	return { past, present: next, future: [] };
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
	const previous = history.past[history.past.length - 1];
	if (previous === undefined) return history;
	return {
		past: history.past.slice(0, -1),
		present: previous,
		future: [history.present, ...history.future],
	};
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
	const [next, ...future] = history.future;
	if (next === undefined) return history;
	return { past: [...history.past, history.present], present: next, future };
}
