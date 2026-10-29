"use client";

// Breadlet News: slides in from the right when the News button in the sidebar footer is clicked.
// Everyone can read posts; admins can write them (with an image) and remove them.
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Newspaper, Trash2, X } from "lucide-react";

type NewsPost = { id: string; category: string; title: string; body: string; created_at: string; has_image: boolean };

const MAX_IMAGE_WIDTH = 1000;

// Shrinks big images to a webp (GIFs under 1 MB are kept as-is so they still animate).
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (file.type === "image/gif" && dataUrl.length < 1400000) return resolve(dataUrl);
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read that image."));
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_WIDTH / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function NewsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [writing, setWriting] = useState(false);
  const [category, setCategory] = useState("Update");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
      setImage(await readImage(file));
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
      body: JSON.stringify({ category, title, body, image: image || null }),
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
              {error && <p className="news-error" role="alert">{error}</p>}
              <div className="news-form-actions">
                <button type="button" onClick={() => { setWriting(false); setError(""); }} disabled={busy}>Cancel</button>
                <button type="submit" className="news-post" disabled={busy}>{busy ? "Posting..." : "Post"}</button>
              </div>
            </form>
          )}

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
              <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</time>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
