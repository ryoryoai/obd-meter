import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check for data-testid attributes
  const testIds = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid'));
  });
  console.log('data-testid found:', testIds);

  // Check tab bar HTML structure
  const tabBarHtml = await page.evaluate(() => {
    // Find text "Dashboard" and get its ancestor tab bar
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === 'Dashboard') {
        // Go up to find the tab bar container
        let el = node.parentElement;
        for (let i = 0; i < 5 && el; i++) el = el.parentElement;
        return el ? el.outerHTML.substring(0, 2000) : 'not found';
      }
    }
    return 'Dashboard text not found';
  });
  console.log('\nTab bar HTML:\n', tabBarHtml);

  await browser.close();
})();
