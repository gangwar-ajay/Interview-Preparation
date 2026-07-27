/* Question registry — one entry per answered question.
   To add a question: create questions/<slug>.html from questions/_template.html,
   then add an entry here. Newest first. */

var QUESTIONS = [
  {
    title: "What is MMLU, and how does log-probability scoring work?",
    topic: "LLMs",
    tags: ["MMLU", "benchmarks", "evaluation", "log-probability"],
    file: "mmlu-logprob.html",
    added: "2026-07-26"
  },
  {
    title: "What is online softmax, and how is it different from normal softmax?",
    topic: "Deep Learning",
    tags: ["softmax", "FlashAttention", "numerical stability", "GPU kernels"],
    file: "online-softmax.html",
    added: "2026-07-26"
  },
  {
    title: "What is perplexity in LLMs?",
    topic: "LLMs",
    tags: ["perplexity", "evaluation", "language modeling", "cross-entropy"],
    file: "perplexity.html",
    added: "2026-07-26"
  },
  {
    title: "What is the attention mechanism in Transformers?",
    topic: "Deep Learning",
    tags: ["transformers", "attention", "LLMs", "NLP"],
    file: "transformer-attention.html",
    added: "2026-07-26"
  },
  {
    title: "What is Gradient Descent?",
    topic: "Machine Learning",
    tags: ["optimization", "training", "learning rate"],
    file: "gradient-descent.html",
    added: "2026-07-26"
  }
];
