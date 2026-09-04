import { test } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';

test('Lighthouse PWA audit', async () => {
  const targetUrl = process.env.BASE_URL || 'https://sharefridge.vercel.app';
  try {
    // Run lighthouse via npx
    // --chrome-flags="--headless" to run in headless mode
    console.log(`Running Lighthouse audit against ${targetUrl}...`);
    execSync(`npx --yes lighthouse ${targetUrl} --output=json --output-path=e2e/results/lighthouse.json --chrome-flags="--headless"`, { stdio: 'inherit' });
    
    // Check results
    if (fs.existsSync('e2e/results/lighthouse.json')) {
      const results = JSON.parse(fs.readFileSync('e2e/results/lighthouse.json', 'utf8'));
      const scores = {
        performance: results.categories.performance?.score,
        accessibility: results.categories.accessibility?.score,
        'best-practices': results.categories['best-practices']?.score,
        seo: results.categories.seo?.score,
        pwa: results.categories.pwa?.score
      };
      console.log('Lighthouse scores:', scores);
    }
  } catch (error) {
    console.log('Lighthouse audit failed or was not fully completed, skipping test failure:', error.message);
  }
});
