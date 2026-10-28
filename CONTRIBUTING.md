# Contributing

Thanks for helping with ioBroker.residents. Bug reports and feature requests go into the [issue tracker](https://github.com/jpawlowski/ioBroker.residents/issues). Questions about using the adapter belong in the [ioBroker forum](https://forum.iobroker.net).

## Development setup

The repository ships a dev container (`.devcontainer/`). Alternatively, use Node.js 22 or newer locally:

```sh
npm ci
npm run build        # builds the admin UI
npm run dev-server:setup
npm run dev-server:watch
```

## Before opening a pull request

```sh
npm run lint
npm run check
npm test
```

Run `npm run build` as well if you changed the admin UI.

Add an entry under `WORK IN PROGRESS` in the changelog section of `README.md` for user-facing changes. Keep pull requests small and focused on one topic.

## CI and security

-   Workflows run on `pull_request` and receive no secrets from forks. Workflows must not use `pull_request_target`, because it runs code in the context of this repository.
-   Dependabot pull requests that match `.github/auto-merge.yml` are merged automatically once checks pass.
