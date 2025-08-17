# YouTube Channel RAG Chatbot

A powerful RAG (Retrieval-Augmented Generation) chatbot that indexes entire YouTube channels and enables intelligent Q&A over video content.

## Features

- Index entire YouTube channels automatically
- Extract and process video transcripts
- Semantic search across all video content
- Modern, responsive chat interface
- Real-time indexing progress tracking
- Source attribution for answers

## Setup

1. Install dependencies:
```bash
npm install
```

2. Environment variables are already configured in `.env`

3. Start the server:
```bash
npm start
```

4. Open http://localhost:3000

## Usage

1. Enter a YouTube Channel ID in the sidebar
2. Click "Index" to process all videos
3. Once indexed, ask questions in the chat interface
4. The bot will answer based on the channel's content

## Tech Stack

- Backend: Node.js, Express
- Vector DB: Upstash Vector
- Embeddings: OpenAI text-embedding-3-small
- Generation: GPT-4o-mini
- Frontend: Vanilla JS with modern CSS