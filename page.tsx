"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; content: string; sql?: string; rows?: Record<string, unknown>[] };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/schema").then((response) => response.json()).then((data) => {
      if (Array.isArray(data.tables)) setTables(data.tables);
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setQuestion("");
    setError("");
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: messages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      setMessages([...nextMessages, { role: "assistant", content: data.answer, sql: data.sql, rows: data.rows }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <header>
          <p className="eyebrow">NL2SQL</p>
          <h1>Ask your data.</h1>
          <p className="subtitle">Ask a question in plain English. Groq writes a read-only MySQL query and explains the result.</p>
          {tables.length > 0 && <p className="tables"><strong>Connected tables:</strong> {tables.join(", ")}</p>}
        </header>
        <div className="messages">
          {messages.length === 0 && <div className="empty">Try “Which five products have the highest MSRP?”</div>}
          {messages.map((message, index) => (
            <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="label">{message.role === "user" ? "You" : "Assistant"}</div>
              <div className="content">{message.content}</div>
              {message.sql && <details><summary>Show SQL and rows</summary><pre>{message.sql}</pre>{message.rows && message.rows.length > 0 && <div className="table-wrap"><table><thead><tr>{Object.keys(message.rows[0]).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{message.rows.map((row, rowIndex) => <tr key={rowIndex}>{Object.keys(message.rows![0]).map((key) => <td key={key}>{String(row[key] ?? "")}</td>)}</tr>)}</tbody></table></div>}</details>}
            </article>
          ))}
          {loading && <article className="message assistant"><div className="label">Assistant</div><div className="content">Querying your database…</div></article>}
        </div>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} className="composer">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Total sales by country" disabled={loading} />
          <button type="submit" disabled={loading || !question.trim()}>Ask</button>
        </form>
      </section>
    </main>
  );
}
