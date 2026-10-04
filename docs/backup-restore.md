# Backup And Restore

Backups are written as custom-format PostgreSQL dumps under `backups/`.

Create a backup:

```sh
infra/scripts/backup-postgres.sh
```

Restore a backup:

```sh
infra/scripts/restore-postgres.sh backups/ai_crm_YYYYMMDDTHHMMSSZ.dump
```

Before restoring production, stop write-heavy workers or place the app in maintenance mode. The restore command uses `--clean --if-exists`, so it replaces existing database objects.
