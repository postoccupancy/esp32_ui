# Contributing / Usage

This repository is a minimal, production-ready **template** intended to be duplicated when starting new projects. It is not meant for external contribution to this repository itself.

How to use

- Duplicate or fork this repository to create a new project.
- Install dependencies: `npm ci` or `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`

Node version

This project targets Node.js 20. Use `nvm use` (if using `nvm`) or ensure your environment uses Node >= 20.

Environment

- Copy `.env.example` to `.env.local` and populate secrets. Do not commit real secrets.

CI and maintenance

- This template includes a GitHub Actions workflow for install/lint/build and Dependabot configuration for dependency updates.

If you need to allow collaboration on a derived project, add collaborators or open the new repo's settings.
