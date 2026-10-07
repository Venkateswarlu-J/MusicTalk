# MusicTalk Frontend (React + Vite)

Modern, clean, responsive web application for the MusicTalk platform.

## Features
- **Instrument Recognition**: Upload any `.wav`, `.mp3` or other audio formats to see detected instruments and confidence levels.
- **Live Recording**: Record audio via microphone directly from the browser and analyze it immediately.
- **Music Catalog**: Browse tracks, search by title/artist/genre, and add new songs mapped with instrument tags.
- **Discover / Recommendations**: Pick instruments to discover relevant tracks tailored to your music taste.

## Tech Stack
- React 18
- Vite
- React Router DOM
- Axios
- Lucide React (Icons)

## Setup & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Dev Server
```bash
npm run dev
```

The frontend will run on `http://localhost:5173` and automatically proxy `/api` calls to the Gateway on port `3000`.
