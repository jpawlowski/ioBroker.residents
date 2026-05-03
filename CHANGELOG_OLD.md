# Older changes
### 1.1.0 (2026-04-01)

-   (iobroker-bot) Adapter requires Node.js >= 20 now
-   (jpawlowski) Migrate admin UI from Materialize CSS to React 18 with TypeScript and MUI v6
-   (jpawlowski) Remove Siri Shortcuts integration
-   (jpawlowski) Fix wayhome presence check using wrong state path (away guard never triggered, allowing wayhome while resident was already home)
-   (jpawlowski) Fix async/await issues in presence forwarding loops and timer callbacks (forEach ignored returned Promises causing silent errors and state write races)
-   (jpawlowski) Fix ReDoS vulnerability in cleanNamespace()
-   (jpawlowski) Fix transitive dependency security vulnerabilities (CVEs in serialize-javascript, qs, esbuild, tough-cookie, form-data)
-   (jpawlowski) Fix null guards and add multilingual resident type translations in admin UI
-   (jpawlowski) Optimize memory usage and processing speed in adapter core
-   (jpawlowski) Update minimum js-controller version to >= 6.0.11
-   (jpawlowski) Update package dependencies

### 1.0.0 (2024-08-24) - 2024 Maintenance Release

-   (jpawlowski) Set minimum Node version to 18.x
-   (jpawlowski) Set minimum JS-Controller version to 5.0.19
-   (jpawlowski) Update package dependencies
-   (jpawlowski) Some minor internal housekeeping

### 0.1.1 (2023-09-09)

-   (jpawlowski) Update package dependencies

### 0.1.0 (2023-06-29)

-   (jpawlowski) First stable version

### 0.1.0-beta.2 (2023-03-12)

-   (jpawlowski) Pets are now allowed to follow the presence of guest residents
