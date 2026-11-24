# My Trading Journal

A personal trading journal for crypto futures (Delta Exchange) and Indian stocks.
It runs in the browser and can be added to your iPad home screen like a real app.

**Your data never leaves your device.** There is no login and no cloud. Trades, journals,
strategies and screenshots are saved inside the browser on your iPad. That is why
**backups are important** (see below).

---

## 1. Put the app online (one-time setup, about 5 minutes)

The app's *code* is published for free with GitHub Pages. Your *trades* are never uploaded.

1. **Make the repository public** (free GitHub Pages needs this).
   GitHub → open this repository → **Settings** → scroll to the bottom ("Danger Zone") →
   **Change visibility** → **Make public** → confirm.
   Only the app's code becomes visible. Your trades stay on your iPad.
2. **Turn on Pages.** In the same Settings page, click **Pages** in the left menu →
   under "Build and deployment" → **Source** → choose **GitHub Actions**.
3. **Merge the code into `main`.** Open the pull request for this work and press
   **Merge pull request** (or ask Claude to open one for you).
4. Wait about 2 minutes. Go to the **Actions** tab – when "Publish app" shows a green tick,
   your app is live at:

   **https://ameychavhan01-boop.github.io/trading-journal/**

From now on, every new version that lands on `main` is published automatically.

## 2. Open it on your iPad and add it to the home screen

1. Open **Safari** on the iPad (must be Safari, not Chrome).
2. Go to the address above.
3. Tap the **Share** button (square with an arrow pointing up, top right).
4. Scroll down and tap **Add to Home Screen** → **Add**.
5. Open the app from the new **JSR** icon on your home screen. It opens full screen and
   works offline.

> Always open the journal from the home-screen icon. Data saved in the home-screen app and
> data saved in a normal Safari tab are kept separately by iPadOS.

The same steps work on an iPhone.

## 3. First steps inside the app

- **Settings → Sample data → Load sample data** to see a filled-in dashboard.
  When you are done looking, press **Delete all sample data** (your own data is not touched).
- **Settings → Journals** to rename "Live – Real", set your starting balance, risk %,
  daily loss limit and max trades per day, or create more journals.
- **Add trade** (or the big **+** on a phone). Only Market, Symbol, Side, Entry, Stop loss
  and Size must be filled. Everything else can be added later.
- **Settings → Money** to change the $ → ₹ rate (default ₹85) and the Delta contract sizes
  (BTCUSD = 0.001 BTC, ETHUSD = 0.01 ETH).

## 4. Quick trade (fast backtesting with fixed ₹ profit)

Tap **Quick trade** (next to Add trade, or in the menu; on a phone: **More → Quick trade**).

**First time only – setup page** (change it any time with **Edit setup**):
journal, timeframe, fixed target profit (e.g. ₹5,000), daily loss limit in ₹, your assets
(BTCUSD and ETHUSD are ready, add more) and an optional strategy.

**Each trade:**
1. Tap the asset (it stays selected).
2. Type **Entry**, **Stop loss** and **Target** prices. Everything else is automatic:
   Long/Short, **R:R** (target distance ÷ stop distance), size, the profit if the target is hit
   (always your fixed amount, e.g. +₹5,000) and the loss if the stop is hit (profit ÷ R:R,
   e.g. −₹2,055 at 1 : 2.43).
3. **Entry:** tap the day, the hour, AM/PM and the minute. Minute buttons follow your
   timeframe (15m and higher: :00 :15 :30 :45, smaller: every 5 minutes); −1 / +1 for an
   exact minute.
4. **Exit:** tap a quick duration (+15m … +1 day) or pick the day and time the same way.
5. Tap **Target hit**, **Stop loss hit**, or **Exited in between** (type the exit price → Save).

The day buttons start from your last saved trade. The small arrow under the entry days
switches direction: **forward** (old → new dates) or **backward** (new → old dates), for
whichever way you move through the chart in Bar Replay.

## 5. Back up your data (please do this every week)

Because everything lives only on the iPad, deleting the app, clearing Safari data, or losing
the iPad would delete your journal. The app shows a **"Backup due"** banner when your last
backup is older than 7 days.

**To back up:** Settings → **Download full backup** → the iPad share sheet opens →
choose **Save to Files** → pick *iCloud Drive* (or Google Drive) → **Save**.
The file is called `trading-journal-backup-YYYY-MM-DD.json` and contains everything,
including screenshots.

**To restore** (new iPad, or after deleting the app): open the app → Settings →
**Restore from backup** → choose the backup file → **Replace and restore**.
This replaces everything currently in the app with the backup.

## 6. Privacy features

- **Journal PIN:** Settings → Journals → **Lock**. The journal then needs its 4–6 digit PIN
  each time the app is opened.
- **Show mode:** bottom of the left menu → **Turn on** → pick one journal. All other journals
  disappear from the whole app until you turn it off with your app PIN (you create this PIN
  the first time).
  If you forget the app PIN, restoring a backup turns Show mode off.

## 7. Exports

- **Export CSV** (Trades page and Dashboard): opens in Excel, Numbers or Google Sheets.
  The Trades page exports exactly what your current filters show.
- **PDF report** (Dashboard uses the selected date range, Reviews uses the selected week or
  month): stats, equity curve, P&L by day and time, psychology, and the trade list.

---

## For developers

React + Vite + TypeScript, Dexie (IndexedDB), PWA via `vite-plugin-pwa`.

```bash
npm install
npm run dev      # local dev server
npm test         # calculation tests
npm run build    # production build into dist/
```

- `src/data/` – the only place that reads or writes data (add online sync here later).
- `src/lib/calc.ts` – all trading math (P&L, R, stats, streaks, drawdown, position size).
- `src/theme/tokens.ts` – every colour; add a new theme by adding one block there.
- `src/lib/time.ts` – IST, 12-hour time formatting.
