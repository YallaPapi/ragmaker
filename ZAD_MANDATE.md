Here are two files, each formatted in the style of your ZAD_MANDATE and CLAUDE.md, for a project that builds a RAG (Retrieval-Augmented Generation) chatbot trained on all YouTube videos from a specific channel, complete with a fast, modern frontend.

***

# ZAD_MANDATE.md

## **ZAD MANDATE — YouTube Channel RAG Chatbot**

### **Purpose**

This mandate defines the operational principles, rules, and constraints for all work on the **YouTube Channel RAG Chatbot** — a system automating:

1. Extraction and indexing of all videos (audio, captions, and/or transcripts as available) from a specified YouTube channel using official APIs
2. Building a searchable, high-performance vector database for video content
3. Setting up a RAG pipeline enabling deep, relevant answers based on channel material
4. Designing an elegant, responsive web frontend for user interaction

***

### **Core-First Mandate**

- **No minimal builds, no reduced scope.**
  All features must integrate with the core codebase, unless isolated harnesses are needed for debugging.
- The system must run **end-to-end**:  
  `Channel selection → Video ingestion → Indexing → Chatbot QA → Frontend`
- **UI must be modern, fast, and visually appealing**—slick design with excellent user experience is a core requirement.

- Chatbot output should be:
  - **Fast**
  - **Relevant to channel material**
  - **Readable and accurate**

***

### **CSV and Data Schema**

- The vector index must include at minimum:
  ```
  VideoID, VideoTitle, TimestampSegment, Transcript, Embedding, SourceURL
  ```

***

### **Error Handling Protocol**

- Any error may be retried for up to **20 fix cycles** before escalation.
- **Cycle Definition:**
  1. Identify error
  2. Research via TaskMaster
  3. Consult necessary documentation via Context7
  4. Apply fix
  5. Retest
- After 20 unsuccessful cycles, escalate as “Blocked”.

***

### **Core System Components**

- **YouTube Loader:** Pulls all video info, captions, and transcripts from channel via API
- **Indexer/Embedder:** Splits and embeds transcripts into vector store
- **RAG Engine:** Integrates retriever and generation models for QA
- **Frontend:** Fast, smooth, polished web UI for user queries and answers
- **Error Cycle Tracker:** Logs each fix attempt per unique error

***

### **Development Rules**

1. Only implement features directly supporting RAG QA or improved UX
2. No breaking schema—all indexed data must match prescribed format
3. API keys, secrets, and OAuth tokens accessed only from environment variables
4. Text prompts (for generator models) must remain consistent unless improvement needed
5. Test every core stage in isolation before full pipeline runs

***

### **Escalation Criteria**

- YouTube data loader blocked/unreachable after 20 cycles
- Vector index fails or produces unreliable retriever results
- UI repeatedly slow, buggy, or failing to render chatbot output
- Model outputs persistently off-topic or incoherent

***

**This mandate is binding for all work on the YouTube Channel RAG Chatbot project.**

***