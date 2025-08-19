## **CLAUDE OPERATIONS MANUAL — YouTube Channel RAG Chatbot**

### **Scope**

This manual details processes, troubleshooting cycles, tool usage, and research methodology for the **YouTube Channel RAG Chatbot**—a system for extracting, indexing, and chatting over all videos from a selected channel, with a top-tier UI.

***

### **System Overview**

The RAG Chatbot pipeline:

1. Accepts a target YouTube channel ID or URL
2. Fetches all video metadata, captions, and/or transcripts via YouTube Data API
3. Splits, embedds, and indexes transcript segments into a vector database
4. Enables chat-based Q&A, retrieving relevant video snippets per query
5. Presents everything in a slick, fast, visually modern webapp

***

### **Mandatory Problem-Solving Methodology**

**Never work on “test” or stripped-down builds except for component diagnostics.**
- Always build from the main codebase
- On error:
  1. Start **Error Cycle**:
      - Research via TaskMaster
      - Context7 for API/library usage, vector database docs, frontend components
      - Fix and retest
  2. Repeat up to 20 cycles; escalate as "Blocked" after max reached
- Track cycles for every unique issue

***

### **Session Startup Checklist**

1. Update/sync branch to latest codebase
2. Ensure all environment variables set:
   - `YOUTUBE_API_KEY`
   - `VECTOR_DB_API_KEY`
   - `GENERATOR_API_KEY` (e.g., OpenAI, Anthropic, etc.)
3. Component tests:
   - YouTube API connection
   - Transcript retrieval and splitting
   - Embedding creation and vector DB indexing
   - RAG QA model output relevance
   - Web frontend loading and response
4. Open TaskMaster and load project tasks
5. Review previously Blocked items

***

### **TaskMaster Integration**

**Core Commands:**
```bash
task-master init
task-master parse-prd docs/prd.txt --research
task-master list
task-master next
task-master show 
task-master set-status --id= --status=done
task-master research "YouTube API transcript availability"
task-master research "Frontend render speed bottleneck"
```
_All research for errors goes through TaskMaster—not direct web search._

***

### **Context7 Integration**

Use Context7 for:

- YouTube Data API endpoints, quotas, transcript/caption access
- Vector database usage patterns and embedding model docs
- QA and chat model integration guides
- Frontend UI library documentation (React/Vue/Svelte as chosen)

***

### **Development Rules**

1. Keep all output schemas consistent and well-documented
2. Refine prompts for quality responses, update only if necessary for improved relevance/accuracy
3. No direct credential storage—environment variable usage only
4. All outputs must deliver rapid, clear, visually pleasant answers
5. Always validate/test each stage before launching full system runs

***

### **Error Recovery Workflow**

1. Identify failed component (YouTube fetch, Indexer, Retriever, Generator, UI)
2. Start fix cycle:
   - TaskMaster research
   - Context7 documentation/examples
   - Fix and retest
   - Log cycles per error
3. Escalate if unresolved after 20 cycles

***

### **Escalation Triggers**

- API connection blocked after 20 cycles
- Data pipeline NOT pulling all channel videos/captions
- Vector store QA output unreliable
- Frontend performance or rendering issues persist

***

**This manual must be followed in full for all work on the YouTube Channel RAG Chatbot.**
- never use websearch, use taskmaster resarch function instead
- DO NOT CALL PARSE-PRD AND --RESEARCH IN THE SAME FUCKING COMMAND FOR TASKMASTER EVER
- If we have gotten to the point where we have developed a frontend, then make sure every time you add features on the backend, you are updating the frontend as well[byterover-mcp]

# important 
always use byterover-retrieve-knowledge tool to get the related context before any tasks 
always use byterover-store-knowledge to store all the critical informations after sucessful tasks

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

- every time you make a local change to fix something, restart the local server so i can test