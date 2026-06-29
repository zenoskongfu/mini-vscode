import cp from "child_process";
import path from "path";
import type { BrowserWindow } from "electron";

interface BreakpointSet {
	path: string;
	lines: number[];
}
interface LaunchConfig {
	type?: string;
	request?: string;
	program?: string;
	name?: string;
}

/**
 * DebugService（main 进程）—— Phase 14 的 DAP 客户端 + 会话管理。
 *
 * spawn 一个 debug adapter 子进程（当前是 out/main/mockDapAdapter.js；之后换
 * @vscode/js-debug 只改 spawn），讲 DAP over stdio（Content-Length 分帧 + seq
 * 请求/响应/事件）。渲染层经 IPC 调 request/start/stop，事件用 webContents.send
 * 单向推（模式同终端 Phase 5）。对应 VSCode 的 DebugSession。
 */
export class DebugService {
	private child: cp.ChildProcessWithoutNullStreams | null = null;
	private win: BrowserWindow | null = null;
	private readonly pending = new Map<number, (body: unknown) => void>();
	private readonly eventWaiters: { name: string; resolve: () => void }[] = [];
	private seq = 1;
	private buf = Buffer.alloc(0);
	private contentLen = -1;

	/** 启动会话：spawn adapter + 完整 DAP 握手 + launch */
	async start(win: BrowserWindow, config: LaunchConfig, breakpoints: BreakpointSet[]): Promise<void> {
		this.win = win;
		this.stop();

		const adapter = path.join(__dirname, "mockDapAdapter.js");
		this.child = cp.spawn(process.execPath, [adapter], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
			stdio: ["pipe", "pipe", "inherit"],
		}) as unknown as cp.ChildProcessWithoutNullStreams;

		this.child.stdout.on("data", (d) => this.onData(d));
		this.child.on("exit", () => {
			this.child = null;
		});

		await this.request("initialize", {
			adapterID: config.type ?? "mock",
			linesStartAt1: true,
			columnsStartAt1: true,
		});

		const launched = this.request("launch", { ...config }); // 不阻塞等 stop
		await this.waitEvent("initialized");
		for (const bp of breakpoints) {
			await this.request("setBreakpoints", {
				source: { path: bp.path, name: path.basename(bp.path) },
				breakpoints: bp.lines.map((line) => ({ line })),
			});
		}
		await this.request("configurationDone", {});
		await launched;
	}

	/** 转发任意 DAP 请求（continue/next/stepIn/stepOut/stackTrace/scopes/variables/evaluate/threads） */
	request(command: string, args?: unknown): Promise<unknown> {
		if (!this.child) return Promise.resolve(undefined);
		const seq = this.seq++;
		return new Promise((resolve) => {
			this.pending.set(seq, resolve);
			this.send({ seq, type: "request", command, arguments: args });
		});
	}

	/** 会话中途增删断点 */
	async setBreakpoints(filePath: string, lines: number[]): Promise<void> {
		if (!this.child) return;
		await this.request("setBreakpoints", {
			source: { path: filePath, name: path.basename(filePath) },
			breakpoints: lines.map((line) => ({ line })),
		});
	}

	stop(): void {
		if (!this.child) return;
		try {
			this.send({
				seq: this.seq++,
				type: "request",
				command: "disconnect",
				arguments: { terminateDebuggee: true },
			});
		} catch {
			/* ignore */
		}
		this.child.kill();
		this.child = null;
		this.pending.clear();
		this.buf = Buffer.alloc(0);
		this.contentLen = -1;
	}

	// ── 内部 ──────────────────────────────────────────────

	private send(msg: Record<string, unknown>): void {
		const json = JSON.stringify(msg);
		this.child?.stdin.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
	}

	private waitEvent(name: string, ms = 5000): Promise<void> {
		return new Promise((resolve, reject) => {
			const w = { name, resolve };
			this.eventWaiters.push(w);
			setTimeout(() => {
				const i = this.eventWaiters.indexOf(w);
				if (i >= 0) {
					this.eventWaiters.splice(i, 1);
					reject(new Error("debug: timeout waiting " + name));
				}
			}, ms);
		});
	}

	private onData(chunk: Buffer): void {
		this.buf = Buffer.concat([this.buf, chunk]);
		for (;;) {
			if (this.contentLen < 0) {
				const i = this.buf.indexOf("\r\n\r\n");
				if (i < 0) break;
				const m = /Content-Length:\s*(\d+)/i.exec(this.buf.subarray(0, i).toString("ascii"));
				this.contentLen = m ? parseInt(m[1], 10) : 0;
				this.buf = this.buf.subarray(i + 4);
			}
			if (this.buf.length < this.contentLen) break;
			const body = this.buf.subarray(0, this.contentLen).toString("utf8");
			this.buf = this.buf.subarray(this.contentLen);
			this.contentLen = -1;
			let msg: { type: string; request_seq?: number; body?: unknown; event?: string };
			try {
				msg = JSON.parse(body);
			} catch {
				continue;
			}
			if (msg.type === "response" && msg.request_seq !== undefined) {
				const resolve = this.pending.get(msg.request_seq);
				this.pending.delete(msg.request_seq);
				resolve?.(msg.body);
			} else if (msg.type === "event" && msg.event) {
				// 内部一次性等待（如 initialized）
				const wi = this.eventWaiters.findIndex((w) => w.name === msg.event);
				if (wi >= 0) {
					const w = this.eventWaiters[wi];
					this.eventWaiters.splice(wi, 1);
					w.resolve();
				}
				// 推给渲染层（stopped/continued/terminated/output…）
				if (this.win && !this.win.isDestroyed()) {
					this.win.webContents.send("debug:event", { event: msg.event, body: msg.body });
				}
			}
		}
	}
}
