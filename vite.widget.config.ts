import { defineConfig } from 'vite';

// Builds the embeddable widget as one self-contained IIFE file in public/widget.js.
// No framework: the host page only needs a <script> tag.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    target: 'es2019',
    minify: true,
    sourcemap: false,
    lib: {
      entry: 'widget/src/main.ts',
      name: 'AcmeChatWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
  },
});
