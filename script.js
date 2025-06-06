// script.js
let data = [];
let fuse = null;
const container = document.getElementById("results");
const input     = document.getElementById("search-box");
const adviceDiv = document.getElementById("advice");

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return magA && magB ? dot / (magA * magB) : 0;
}

function keywordScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 0.30;
  if (t.startsWith(q)) return 0.20;
  if (t.split(" ").some(w => w.startsWith(q))) return 0.10;
  return 0;
}

function highlight(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "ig");
  return text.replace(regex, "<mark>$1</mark>");
}

async function embedQueryViaOpenAI(query) {
  try {
    const res = await fetch("/.netlify/functions/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: query }),
    });
    const payload = await res.json();
    return payload.embedding || null;
  } catch {
    return null;
  }
}

async function getAdvice(query, topQuestions) {
  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt: `User asked: "${query}". Given these top matches: ${topQuestions.map(q=>`"${q.question}"`).join(", ")}, suggest which one is best and why.` 
      }),
    });
    const json = await res.json();
    return json.advice || "";
  } catch {
    return "";
  }
}

function renderResults(results, query) {
  container.innerHTML = "";
  if (results.length === 0) {
    container.innerHTML = "<p><em>No results matched.</em></p>";
    adviceDiv.innerHTML = "";
    return;
  }
  results.forEach(result => {
    const card = document.createElement("div");
    card.className = "card";
    let answerHTML = "";
    for (const ans of result.answers) {
      answerHTML += `<li>${ans}</li>`;
    }
    card.innerHTML = `
      <strong>Q:</strong> ${highlight(result.question, query)}<br>
      <details>
        <summary><strong>Answers (${result.answers.length})</strong></summary>
        <ul>${answerHTML}</ul>
      </details>
      <small>Score: ${result.score.toFixed(3)}</small>
    `;
    container.appendChild(card);
  });
  getAdvice(query, results).then(text => {
    adviceDiv.innerText = text;
  });
}

async function loadData() {
  try {
    const res = await fetch("rfp_data_with_local_embeddings.json");
    data = await res.json();
    const fuseOptions = {
      includeScore: true,
      threshold: 0.6,
      distance: 100,
      minMatchCharLength: 3,
      keys: ["question"]
    };
    fuse = new Fuse(data, fuseOptions);
  } catch {}
}

async function search(query) {
  if (query.length < 4) {
    container.innerHTML = "";
    adviceDiv.innerHTML = "";
    return;
  }
  let queryEmbedding = null;
  try {
    queryEmbedding = await embedQueryViaOpenAI(query);
  } catch {}
  const scored = data.map(entry => {
    const sim = queryEmbedding ? cosineSimilarity(queryEmbedding, entry.embedding) : 0;
    const kw = keywordScore(query, entry.question);
    return {
      question: entry.question,
      answers: entry.answers,
      score: sim + kw
    };
  });
  const passScore = scored
    .filter(r => r.score >= 0.25)
    .sort((a, b) => b.score - a.score);
  let results = passScore;
  if (passScore.length === 0 && fuse) {
    const fuseHits = fuse.search(query, { limit: 10 });
    results = fuseHits.map(hit => {
      const entry = hit.item;
      return {
        question: entry.question,
        answers: entry.answers,
        score: Math.max(0.25, 1.0 - hit.score)
      };
    });
  }
  renderResults(results.slice(0, 10), query);
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  input.addEventListener("input", e => {
    const q = e.target.value.trim();
    search(q);
  });
});