// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // 指定入口文件路径
  build: {
    rollupOptions: {
      input: {
        main: './public/index.html'  // 替换成你实际的 index.html 路径
      }
    }
  }
});