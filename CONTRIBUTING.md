# Contributing

Thanks for helping make ANT sturdier.

## Development

```bash
npm ci
npm test
npm run build
npm run typecheck
npm run test:e2e
```

Keep changes small and focused. ANT memories should remain structured records, not raw chat logs.

## Packaging Checks

Before publishing or tagging an alpha build, run:

```bash
npm run verify:pack
```

This verifies that the packed npm artifact contains the built CLI files and can run `ant` help/init from the unpacked package.

## Privacy

Avoid committing real logs, databases, `.env` files, tokens, or private paths. Use fake fixtures under `examples/`.
