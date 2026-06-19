// Ambient declarations for the renderer.

// Allow importing CSS files as side-effect modules (Vite handles the bundling).
declare module '*.css'

// Vite ?worker imports — Monaco's web workers are imported with this suffix.
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}
