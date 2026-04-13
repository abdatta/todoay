# Todoay

Todoay is a lightweight daily-use app for tasks, notes and misc lists built with Next.js.

## Development

```bash
npm install
npm run dev
```

## Static export

```bash
npm run build
```

The app uses localStorage only, so it can be hosted as a static site.

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.

1. Push the repository to GitHub.
2. In GitHub, open `Settings > Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or run the workflow manually from the `Actions` tab.

The workflow builds a static export and deploys the `out` directory to project Pages using the repository path as the production base path.

## PWA installability

The app includes a web app manifest, install icons, and a service worker so it can be installed from Chrome on Android after deployment.

Each GitHub Pages deploy also stamps the app with the current commit SHA so installed clients can detect a new service worker and reload onto the latest code.
