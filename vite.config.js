import { defineConfig } from 'vite'

// Library build: one ES module plus one stylesheet, gsap stays external
export default defineConfig({
  build: {
    lib: { entry: 'src/index.js', formats: ['es'], fileName: () => 'carousels.js', cssFileName: 'carousels' },
    rollupOptions: { external: [/^gsap/] },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.js'] },
})
