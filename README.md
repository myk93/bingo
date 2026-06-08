# Bingo Builder (GitHub Pages Ready)

A static bingo board app with local memory (`localStorage`).

## Features

- Edit tile text quickly (unlocked mode)
- Fixed tile positions (no dragging)
- Lock/Unlock layout button
- In locked mode, still place translucent stamps on tiles
- Board zoom control for mobile use (works in locked mode)
- Reset board button with confirmation prompt before deletion
- All data saved in browser local storage

## Run locally

Open [index.html](index.html) in your browser.

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. In repository settings, open **Pages**.
3. Under **Build and deployment**, choose:
   - **Source:** Deploy from a branch
   - **Branch:** `main` (or your default branch), folder `/ (root)`
4. Save and wait for deployment.
5. Open the Pages URL.

Your bingo board data stays on each user’s browser (local memory), not in GitHub.
