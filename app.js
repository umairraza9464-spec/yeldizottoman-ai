#!/usr/bin/env node
// ============================================
// 🚀 YELDIZOTTOMAN AI - Complete Automation
// Login Once -> Save Forever -> Auto Run
// ============================================

const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

// ============================================
// 💾 PERSISTENT SESSION MANAGER
// ============================================

class SessionManager {
  constructor() {
    this.sessionDir = path.join(__dirname, '.sessions');
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  saveCookies(platform, cookies) {
    const file = path.join(this.sessionDir, `${platform}-cookies.json`);
    fs.writeFileSync(file, JSON.stringify(cookies, null, 2));
    console.log(`✅ ${platform} cookies saved`);
  }

  loadCookies(platform) {
    const file = path.join(this.sessionDir, `${platform}-cookies.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return [];
  }

  isLoggedIn(platform) {
    return this.loadCookies(platform).length > 0;
  }
}

const sessions = new SessionManager();

// ============================================
// 🔐 LOGIN FUNCTION (Manual 1 Time)
// ============================================

app.post('/api/login/:platform', async (req, res) => {
  const { platform } = req.params; // 'facebook' or 'olx'
  const { email, password } = req.body;

  try {
    console.log(`🔓 Starting ${platform} login...`);
    
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    let loginUrl, emailSelector, passwordSelector, buttonSelector;

    if (platform === 'facebook') {
      loginUrl = 'https://www.facebook.com';
      emailSelector = 'input[name="email"]';
      passwordSelector = 'input[name="pass"]';
      buttonSelector = 'button[name="login"]';
    } else if (platform === 'olx') {
      loginUrl = 'https://www.olx.in/login';
      emailSelector = 'input[type="email"]';
      passwordSelector = 'input[type="password"]';
      buttonSelector = 'button[type="submit"]';
    }

    // Navigate
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    // Enter email
    await page.type(emailSelector, email, { delay: 50 });
    await page.click(buttonSelector);
    await page.waitForTimeout(2000);

    // Enter password
    if (platform === 'facebook') {
      await page.type(passwordSelector, password, { delay: 50 });
      await page.click(buttonSelector);
    } else {
      await page.type(passwordSelector, password, { delay: 50 });
      await page.click(buttonSelector);
    }

    // Wait for login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Save cookies
    const cookies = await page.cookies();
    sessions.saveCookies(platform, cookies);

    await browser.close();

    res.json({ success: true, message: `✅ ${platform} login successful!` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 🤖 AUTO SCRAPER (Uses Saved Cookies)
// ============================================

class AutoScraper {
  constructor() {
    this.browser = null;
    this.scrapedIds = new Set();
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    });
  }

  async scrapeOLX(city = 'delhi') {
    try {
      const cookies = sessions.loadCookies('olx');
      if (cookies.length === 0) throw new Error('OLX not logged in');

      const page = await this.browser.newPage();
      await page.setCookie(...cookies);

      const url = `https://www.olx.in/${city}/cars-for-sale`;
      await page.goto(url, { waitUntil: 'networkidle2' });

      const listings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-id]')).map(el => ({
          id: el.getAttribute('data-id'),
          title: el.querySelector('[data-test-id="listing-link"]')?.textContent?.trim(),
          price: el.querySelector('[data-test-id="ad-price"]')?.textContent?.trim(),
          location: el.querySelector('[data-test-id="ad-location"]')?.textContent?.trim(),
          link: el.querySelector('a[role="link"]')?.href,
          seller: el.getAttribute('data-seller')
        })).filter(l => l.id && l.title);
      });

      await page.close();
      return listings;
    } catch (error) {
      console.error('OLX scrape error:', error.message);
      return [];
    }
  }

  async scrapeFacebook() {
    try {
      const cookies = sessions.loadCookies('facebook');
      if (cookies.length === 0) throw new Error('Facebook not logged in');

      const page = await this.browser.newPage();
      await page.setCookie(...cookies);

      await page.goto('https://www.facebook.com/marketplace/vehicles/', {
        waitUntil: 'networkidle2'
      });

      // Scroll to load
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);

      const listings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[role="article"]')).map(el => ({
          title: el.querySelector('h3')?.textContent?.trim(),
          price: el.querySelector('[class*="price"]')?.textContent?.trim(),
          link: el.querySelector('a')?.href
        })).filter(l => l.title);
      });

      await page.close();
      return listings;
    } catch (error) {
      console.error('Facebook scrape error:', error.message);
      return [];
    }
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}

const scraper = new AutoScraper();

// ============================================
// 🔄 AUTOMATION ENDPOINTS
// ============================================

app.get('/api/status', (req, res) => {
  res.json({
    facebook: sessions.isLoggedIn('facebook'),
    olx: sessions.isLoggedIn('olx')
  });
});

app.post('/api/start-automation', async (req, res) => {
  const { cities = ['delhi', 'mumbai'], interval = 300000 } = req.body;

  console.log(`\n🚀 AUTOMATION STARTED - Every ${interval / 1000}s\n`);

  await scraper.initialize();

  setInterval(async () => {
    // Scrape OLX
    for (const city of cities) {
      const listings = await scraper.scrapeOLX(city);
      console.log(`[${new Date().toLocaleTimeString()}] 📍 ${city}: ${listings.length} listings`);
    }

    // Scrape Facebook
    const fbListings = await scraper.scrapeFacebook();
    console.log(`[${new Date().toLocaleTimeString()}] 📱 Facebook: ${fbListings.length} listings`);
  }, interval);

  res.json({ running: true, message: 'Automation started!' });
});

app.post('/api/logout/:platform', (req, res) => {
  const { platform } = req.params;
  fs.unlinkSync(path.join(sessions.sessionDir, `${platform}-cookies.json`));
  res.json({ message: `${platform} logged out` });
});

// ============================================
// 🌐 SIMPLE HTML DASHBOARD
// ============================================

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🤖 Yeldizottoman AI</title>
      <style>
        body { font-family: Arial; background: #0f0f0f; color: white; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; }
        button { padding: 10px 20px; margin: 10px 0; background: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 5px; }
        button:hover { background: #45a049; }
        input { padding: 10px; margin: 10px 0; width: 100%; box-sizing: border-box; }
        .status { padding: 10px; margin: 10px 0; background: #333; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 Yeldizottoman AI</h1>
        <h3>Login Status</h3>
        <div id="status" class="status">Loading...</div>

        <h3>Facebook Login</h3>
        <input type="email" id="fbEmail" placeholder="Facebook Email">
        <input type="password" id="fbPass" placeholder="Facebook Password">
        <button onclick="loginFB()">Login Facebook</button>

        <h3>OLX Login</h3>
        <input type="email" id="olxEmail" placeholder="OLX Email">
        <input type="password" id="olxPass" placeholder="OLX Password">
        <button onclick="loginOLX()">Login OLX</button>

        <h3>Automation</h3>
        <button onclick="startAutomation()">Start Automation</button>
        <button onclick="logout('facebook')">Logout Facebook</button>
        <button onclick="logout('olx')">Logout OLX</button>
      </div>

      <script>
        async function updateStatus() {
          const res = await fetch('/api/status');
          const data = await res.json();
          document.getElementById('status').innerHTML = `
            Facebook: ${data.facebook ? '✅ Logged In' : '❌ Not Logged In'}<br>
            OLX: ${data.olx ? '✅ Logged In' : '❌ Not Logged In'}
          `;
        }

        async function loginFB() {
          const email = document.getElementById('fbEmail').value;
          const password = document.getElementById('fbPass').value;
          await fetch('/api/login/facebook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          updateStatus();
        }

        async function loginOLX() {
          const email = document.getElementById('olxEmail').value;
          const password = document.getElementById('olxPass').value;
          await fetch('/api/login/olx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          updateStatus();
        }

        async function startAutomation() {
          await fetch('/api/start-automation', { method: 'POST' });
          alert('✅ Automation started!');
        }

        async function logout(platform) {
          await fetch(`/api/logout/${platform}`, { method: 'POST' });
          updateStatus();
        }

        updateStatus();
      </script>
    </body>
    </html>
  `);
});

// ============================================
// 🚀 START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
✅ Yeldizottoman AI Running at http://localhost:${PORT}
🔐 Login once, automation runs forever!
  `);
});
