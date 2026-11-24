"use client";

// Breadlet News: slides in from the right when the News button in the sidebar footer is clicked.
// Everyone can read posts; admins can write them (with an image) and remove them.
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, ImagePlus, Newspaper, Trash2, X } from "lucide-react";
import { shrinkImage } from "../../lib/shrink-image";
import { ReactionButton, ReactionChips, useReactions } from "./reactions";

type Poll = { options: string[]; counts: number[]; mine: number | null };
type NewsPost = { id: string; category: string; title: string; body: string; created_at: string; has_image: boolean; poll?: Poll };

export function NewsPanel({ open, onClose, canReact = true }: { open: boolean; onClose: () => void; canReact?: boolean }) {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [writing, setWriting] = useState(false);
  const [category, setCategory] = useState("Update");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  // Poll answers for a new post (empty: no poll).
  const [pollOptions, setPollOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { reactions, toggle } = useReactions("news", open ? (posts || []).map((post) => post.id) : []);
  const react = async (id: string, emoji: string) => {
    const problem = await toggle(id, emoji);
    if (problem) setError(problem);
  };

  const load = useCallback(async () => {
    const response = await fetch("/api/news", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setPosts(data?.posts || []);
    setCanManage(Boolean(data?.canManage));
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|gif|jpeg|webp)$/.test(file.type)) return setError("Upload a PNG, GIF, JPEG, or WebP image.");
    setError("");
    try {
      setImage(await shrinkImage(file, { maxLength: 1400000, maxSide: 1600 }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not read that image.");
    }
  };

  const publish = async () => {
    if (!title.trim()) return setError("Give the post a title.");
    setBusy(true);
    setError("");
    const response = await fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, title, body, image: image || null, poll: pollOptions.map((option) => option.trim()).filter(Boolean) }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError(data?.error || "Could not post that.");
    setPosts((current) => [data as NewsPost, ...(current || [])]);
    setWriting(false);
    setCategory("Update");
    setTitle("");
    setBody("");
    setImage("");
    setPollOptions([]);
  };

  const vote = async (post: NewsPost, choice: number) => {
    if (!canReact) return;
    const response = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post: post.id, vote: choice }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) return setError(data?.error || "Could not vote.");
    setPosts((current) => (current || []).map((entry) => (entry.id === post.id ? { ...entry, poll: data.poll } : entry)));
  };

  const remove = async (post: NewsPost) => {
    if (!window.confirm(`Remove "${post.title}" for everyone?`)) return;
    const response = await fetch(`/api/news?id=${encodeURIComponent(post.id)}`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) setPosts((current) => (current || []).filter((entry) => entry.id !== post.id));
  };

  if (!open) return null;
  return (
    <div className="news-overlay" onClick={onClose}>
      <aside className="news-panel" role="dialog" aria-modal="true" aria-labelledby="news-title" onClick={(event) => event.stopPropagation()}>
        <header className="news-header">
          <Newspaper size={30} strokeWidth={2.4} aria-hidden="true" />
          <h2 id="news-title"><b>Breadlet</b> News</h2>
          <button type="button" onClick={onClose} aria-label="Close news" className="news-close"><X size={30} strokeWidth={3} /></button>
        </header>

        <div className="news-body">
          {canManage && !writing && <button type="button" className="news-new" onClick={() => setWriting(true)}>+ New post</button>}
          {canManage && writing && (
            <form className="news-card news-form" onSubmit={(event) => { event.preventDefault(); void publish(); }}>
              <label>Label<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={40} placeholder="Market Update" /></label>
              <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="The Fall Bag is here!" required /></label>
              <label>Text<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={5} placeholder="What's new? Each line becomes its own paragraph." /></label>
              <input ref={fileRef} type="file" accept="image/png,image/gif,image/jpeg,image/webp" className="hidden" onChange={(event) => { void pickImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              {image ? (
                <div className="news-form-image">
                  <img src={image} alt="Post image preview" />
                  <button type="button" onClick={() => setImage("")}>Remove image</button>
                </div>
              ) : (
                <button type="button" className="news-upload" onClick={() => fileRef.current?.click()}><ImagePlus size={18} aria-hidden="true" />Add image</button>
              )}
              {pollOptions.length ? (
                <div className="news-poll-form">
                  <b><BarChart3 size={16} aria-hidden="true" />Poll answers</b>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="news-poll-form-row">
                      <input value={option} onChange={(event) => setPollOptions((list) => list.map((item, at) => (at === index ? event.target.value : item)))} maxLength={80} placeholder={`Answer ${index + 1}`} />
                      {pollOptions.length > 2 && <button type="button" onClick={() => setPollOptions((list) => list.filter((_, at) => at !== index))} aria-label={`Remove answer ${index + 1}`}><X size={14} /></button>}
                    </div>
                  ))}
                  <div className="news-poll-form-actions">
                    {pollOptions.length < 6 && <button type="button" onClick={() => setPollOptions((list) => [...list, ""])}>+ Answer</button>}
                    <button type="button" onClick={() => setPollOptions([])}>Remove poll</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="news-upload" onClick={() => setPollOptions(["", ""])}><BarChart3 size={18} aria-hidden="true" />Add poll</button>
              )}
              {error && <p className="news-error" role="alert">{error}</p>}
              <div className="news-form-actions">
                <button type="button" onClick={() => { setWriting(false); setError(""); }} disabled={busy}>Cancel</button>
                <button type="submit" className="news-post" disabled={busy}>{busy ? "Posting..." : "Post"}</button>
              </div>
            </form>
          )}

          {error && !writing && <p className="news-error" role="alert">{error}</p>}
          {posts === null && <p className="news-empty">Loading...</p>}
          {posts?.length === 0 && !writing && (
            <div className="news-empty">
              <Newspaper size={48} aria-hidden="true" />
              <p>No news yet</p>
              <span>Check back soon for updates.</span>
            </div>
          )}
          {posts?.map((post) => (
            <article key={post.id} className="news-card">
              <div className="news-card-top">
                <span className="news-category">{post.category}</span>
                {canManage && <button type="button" onClick={() => void remove(post)} aria-label={`Remove ${post.title}`} className="news-remove"><Trash2 size={16} /></button>}
              </div>
              <h3>{post.title}</h3>
              {post.has_image && <img src={`/api/news?image=${post.id}`} alt="" className="news-image" loading="lazy" />}
              {post.body.split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
              {post.poll && <PollBox poll={post.poll} canVote={canReact} onVote={(choice) => void vote(post, choice)} />}
              <div className="news-card-bottom">
                <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</time>
                {canReact && <ReactionButton className="news-react" size={18} onPick={(emoji) => void react(post.id, emoji)} />}
              </div>
              <ReactionChips counts={reactions[post.id]} onToggle={(emoji) => void react(post.id, emoji)} disabled={!canReact} />
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

// A news poll: tap an answer to vote (tap another to change it). Results show once you've voted.
function PollBox({ poll, canVote, onVote }: { poll: Poll; canVote: boolean; onVote: (choice: number) => void }) {
  const total = poll.counts.reduce((sum, count) => sum + count, 0);
  const voted = poll.mine !== null;
  return (
    <div className="news-poll">
      {poll.options.map((option, index) => {
        const share = total ? Math.round((poll.counts[index] / total) * 100) : 0;
        return (
          <button key={index} type="button" disabled={!canVote} onClick={() => onVote(index)} className={`news-poll-option${poll.mine === index ? " is-mine" : ""}`} aria-pressed={poll.mine === index}>
            {voted && <span className="news-poll-bar" style={{ width: `${share}%` }} aria-hidden="true" />}
            <span className="news-poll-label">{option}</span>
            {voted && <span className="news-poll-share">{share}%</span>}
          </button>
        );
      })}
      <small className="news-poll-total">{total.toLocaleString()} vote{total === 1 ? "" : "s"}{voted ? " · tap another answer to change your vote" : canVote ? " · tap an answer to vote" : ""}</small>
    </div>
  );
}
