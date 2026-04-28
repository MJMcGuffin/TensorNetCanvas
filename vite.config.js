import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Custom plugin to automatically attach classes to the window object
const exposeGlobals = (classes) => {
  return {
    name: 'expose-globals',
    transform(code, id) {
      // Inject the window assignment into the module.
      // Rollup will automatically map 'cls' to whatever internal 
      // name (like CTensor$1) it generates during bundling.
      const injections = classes
        .map(cls => `if (typeof ${cls} !== 'undefined') window.${cls} = ${cls};`)
        .join('\n');
      
      return {
        code: code + '\n' + injections,
        map: null
      };
    }
  };
};

export default defineConfig({
  plugins: [
    viteSingleFile(),
    // List the exact names of the classes as they appear in your source code
    exposeGlobals(['CTensor']) 
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    minify: false, // Leave false to keep the bundled code readable
  }
})

