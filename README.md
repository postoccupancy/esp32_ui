This repo is a download of the Devias Material UI Kit Pro v6.0.0-Standard Plus for TypeScript, adapted to a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting started

First, clean-install dependencies:

```bash
npm ci
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.



## Pushing commits
The GitHub Actions CI workflow (`.github/workflows/ci.yml`) runs:
```bash
npm ci && npm run build && npm run lint
``` 
on every PR to the repo. 

Save time by testing and resolving these before every commit. 
```bash
npm run lint
npm run build
```


## About Next.js

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Next.js GitHub repository](https://github.com/vercel/next.js/)


## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

Check out [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.


## Optional Vercel config

[`vercel.json`](/vercel.json) 
- Pins Node to 20.x, identifies Next.js framework.
- Documents build/install/dev commands explicitly.
- Includes placeholder for environment variable setup (update with actual secret names when deploying).

[`.vercelignore`](/.vercelignore)
- Excludes git metadata, docs, and config from the deployment bundle (saves time/bandwidth).


## Other config

[`.github/dependabot.yml`](/.github/dependabot.yml) - makes weekly npm updates

[`.nvmrc`](/.nvmrc) - pins Node version 20

[`.env.example`](/.env.example) -- example .env file, copy to `.env.local`


## Governance docs boilerplate

[`CONTRIBUTING.md`](/CONTRIBUTING.md) 
[`CODEOWNERS`](/.github/CODEOWNERS)


## GitHub repo settings: branch protection and required status checks

✅ *Require a pull request before merging*
Require approvals: 1 (or more if you want peer review)
Dismiss stale PR approvals when new commits are pushed

✅ *Require status checks to pass before merging*
Require branches to be up to date before merging
Check required: build (the job from ci.yml)

✅ *Require code reviews*
Require at least 1 approval from CODEOWNERS (optional but recommended for team projects; for solo template, can skip)

✅ *Require conversation resolution before merging*
Forces resolution of any PR comments/discussions

✅ *Require branches to be up to date before merging*
Already mentioned above, but automatic rebases are helpful

✅ *Include administrators in restrictions (optional)*
Ensures even org owners follow the rules