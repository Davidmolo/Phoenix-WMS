# Phoenix WMS frontend

Next.js app for staff and customer portal UIs.

See the root [README](../README.md) for local setup. Production builds should use:

```bash
NEXT_PUBLIC_API_URL=/api
```

so the browser calls the API through the same origin (nginx), not a localhost URL.
