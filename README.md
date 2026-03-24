# log-viewer

Local log files in a web UI (work in progress).

## Layout

- [backend/](backend/) — Python (Flask) API (scaffold only).
- [frontend/](frontend/) — static HTML/CSS/JS (scaffold only).

## Dependencies

From the repository root:

```bash
cd backend
python -m pip install -r requirements.txt
```

Optional: copy [backend/.env.example](backend/.env.example) to `backend/.env` and set `LOG_ROOT` when you implement configuration.

## Run backend (empty app)

```bash
cd backend
python app.py
```

The scaffold does not serve the `frontend/` folder or expose log APIs yet.
