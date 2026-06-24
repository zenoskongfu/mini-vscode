// renderer 的环境声明。

// 允许将 CSS 文件作为副作用模块导入（由 Vite 负责打包）。
declare module '*.css'

// Vite ?worker 导入：Monaco 的 web worker 会通过这个后缀导入。
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}
