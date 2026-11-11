import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',use:{baseURL:'http://localhost:4173',launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']},serviceWorkers:'block'},workers:1,reporter:'list'});
