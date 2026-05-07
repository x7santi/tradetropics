How it works end-to-end:

App launches → waits 3 seconds → silently calls autoUpdater.checkForUpdates()
Rechecks every 4 hours while the app is open
If an update exists, it downloads in the background — a small banner appears at the bottom of the screen showing "Downloading update…" with a spinner
Once downloaded, the banner changes to "TradeTropics v1.x.x is ready — Restart now"
Clicking Restart now calls quitAndInstall — the app relaunches on the new version
User can dismiss the banner and install later (it installs automatically on next quit anyway)
To publish a release, you'll need to:

Create a GitHub repo (or use an existing one)
Update owner/repo in package.json to match
Set GH_TOKEN=your_token env var when running npm run release:mac or release:win
Bump the version in package.json before each release — that's what triggers the update check