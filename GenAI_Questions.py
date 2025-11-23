1. Everyone keeps saying hallucinations are the biggest problem in LLMs. If you had to reduce them, where would you start?
  - Hallucination usually happend when the model is missing one of the 3 things:
    - Right context
    - Right constraints
    - Right confidence boundaries

2. How to measure hallucinations?
  - You don't measure outputs, you measure decision pointers
  - Check :
    - Did retreival fetched relevant chunks?
    - Was the prompt well scoped?
    - Did the agent attempt a tool call before guessing?
    - Did the system allow a - I don't know fallback?
