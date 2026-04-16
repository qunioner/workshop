"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FileEntry = {
  key: string;
  displayName: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
};

const SESSION_KEY = "admin_password";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconPlay() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.908a.75.75 0 0 1 .766.027l3.5 2.25a.75.75 0 0 1 0 1.262l-3.5 2.25A.75.75 0 0 1 8 12.25v-4.5a.75.75 0 0 1 .39-.658Z" clipRule="evenodd" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5Z" clipRule="evenodd" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 transition">
      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z" />
      <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  // Auth
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const savedPw = useRef("");

  // Files
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Per-item states
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async (pw: string): Promise<{ ok: boolean; status?: number }> => {
    setLoading(true);
    try {
      const res = await fetch("/api/upload", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      setFiles(data.files);
      return { ok: true };
    } catch {
      return { ok: false, status: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      savedPw.current = stored;
      fetchFiles(stored).then(({ ok }) => { if (ok) setAuthed(true); });
    }
  }, [fetchFiles]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const { ok, status } = await fetchFiles(password);
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, password);
      savedPw.current = password;
      setAuthed(true);
    } else if (status === 401) {
      setAuthError("パスワードが違います");
    } else {
      setAuthError(`サーバーエラー (${status}) — R2接続を確認してください`);
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-admin-password": savedPw.current },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setUploadError(data.error ?? "アップロードに失敗しました");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      await fetchFiles(savedPw.current);
    } catch {
      setUploadError("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(keys: string[]) {
    if (!confirm(`${keys.length} 件のファイルを削除しますか？`)) return;
    setDeletingKeys((prev) => new Set([...prev, ...keys]));
    try {
      const res = await fetch("/api/upload", {
        method: "DELETE",
        headers: {
          "x-admin-password": savedPw.current,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keys }),
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => !keys.includes(f.key)));
        setSelected((prev) => {
          const next = new Set(prev);
          keys.forEach((k) => next.delete(k));
          return next;
        });
        if (previewKey && keys.includes(previewKey)) setPreviewKey(null);
      }
    } finally {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
      setBulkDeleting(false);
    }
  }

  async function handleBulkDelete() {
    const keys = [...selected];
    if (!keys.length) return;
    setBulkDeleting(true);
    await handleDelete(keys);
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  function startEditing(f: FileEntry) {
    setEditingKey(f.key);
    setEditingName(f.displayName);
  }

  async function saveRename(key: string) {
    if (!editingName.trim()) return;
    setSavingKey(key);
    try {
      const res = await fetch("/api/rename", {
        method: "PATCH",
        headers: {
          "x-admin-password": savedPw.current,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, displayName: editingName.trim() }),
      });
      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.key === key ? { ...f, displayName: editingName.trim() } : f
          )
        );
        setEditingKey(null);
      }
    } finally {
      setSavingKey(null);
    }
  }

  // ── Misc ──────────────────────────────────────────────────────────────────

  async function copyLink(key: string) {
    const url = `${location.origin}/p/${encodeURIComponent(key)}`;
    await navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(
      selected.size === files.length
        ? new Set()
        : new Set(files.map((f) => f.key))
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-950">
        <form
          onSubmit={handleLogin}
          className="bg-gray-900 p-8 rounded-2xl shadow-xl flex flex-col gap-4 w-80"
        >
          <h1 className="text-white text-xl font-bold text-center">管理画面</h1>
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {authError && <p className="text-red-400 text-sm">{authError}</p>}
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-semibold transition"
          >
            ログイン
          </button>
        </form>
      </main>
    );
  }

  // ── Admin screen ──────────────────────────────────────────────────────────

  const allSelected = files.length > 0 && selected.size === files.length;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">音源管理</h1>

        {/* ── Upload ── */}
        <section className="bg-gray-900 p-6 rounded-2xl space-y-4">
          <h2 className="text-lg font-semibold">音源をアップロード</h2>
          <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              required
              className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg
                file:mr-3 file:bg-indigo-600 file:border-0 file:text-white
                file:px-3 file:py-1 file:rounded file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={uploading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              {uploading ? "アップロード中…" : "アップロード"}
            </button>
          </form>
          {uploadError && <p className="text-red-400 text-sm">{uploadError}</p>}
        </section>

        {/* ── File list ── */}
        <section className="bg-gray-900 p-6 rounded-2xl space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">アップロード済み音源</h2>
              {selected.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="text-sm bg-red-600/20 hover:bg-red-600/30 text-red-400
                    px-3 py-1 rounded-lg transition disabled:opacity-50"
                >
                  {bulkDeleting
                    ? "削除中…"
                    : `選択した ${selected.size} 件を削除`}
                </button>
              )}
            </div>
            <button
              onClick={() => fetchFiles(savedPw.current)}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              更新
            </button>
          </div>

          {loading ? (
            <p className="text-gray-400 text-sm">読み込み中…</p>
          ) : files.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ音源がありません</p>
          ) : (
            <>
              {/* Select all */}
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-indigo-500 w-4 h-4"
                />
                すべて選択
              </label>

              {/* List */}
              <ul className="divide-y divide-gray-800">
                {files.map((f) => (
                  <li key={f.key} className="py-4 space-y-3">
                    {/* Row */}
                    <div className="flex items-center gap-3">

                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selected.has(f.key)}
                        onChange={() => toggleSelect(f.key)}
                        className="accent-indigo-500 w-4 h-4 shrink-0"
                      />

                      {/* Preview toggle */}
                      <button
                        onClick={() =>
                          setPreviewKey(previewKey === f.key ? null : f.key)
                        }
                        className={`shrink-0 transition ${
                          previewKey === f.key
                            ? "text-indigo-400"
                            : "text-gray-500 hover:text-indigo-400"
                        }`}
                        title={
                          previewKey === f.key
                            ? "プレイヤーを閉じる"
                            : "プレビュー再生"
                        }
                      >
                        {previewKey === f.key ? <IconStop /> : <IconPlay />}
                      </button>

                      {/* Name & meta */}
                      <div className="flex-1 min-w-0">
                        {editingKey === f.key ? (
                          /* ── Rename input ── */
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename(f.key);
                                if (e.key === "Escape") setEditingKey(null);
                              }}
                              autoFocus
                              className="bg-gray-800 text-white text-sm px-3 py-1 rounded-lg
                                outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs"
                            />
                            <button
                              onClick={() => saveRename(f.key)}
                              disabled={savingKey === f.key}
                              className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-700
                                disabled:opacity-50 px-2 py-1 rounded transition"
                            >
                              {savingKey === f.key ? "…" : "保存"}
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="shrink-0 text-xs text-gray-400 hover:text-white
                                px-2 py-1 rounded transition"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          /* ── Display name (click to edit) ── */
                          <button
                            onClick={() => startEditing(f)}
                            title="クリックしてリネーム"
                            className="group flex items-center gap-1 text-sm font-medium
                              text-left w-full hover:text-indigo-300 transition"
                          >
                            <span className="truncate">{f.displayName}</span>
                            <IconEdit />
                          </button>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatBytes(f.size)}
                          {f.lastModified && ` · ${formatDate(f.lastModified)}`}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => copyLink(f.key)}
                          className="text-xs bg-gray-800 hover:bg-gray-700
                            px-3 py-1.5 rounded-lg transition"
                        >
                          {copiedKey === f.key ? "コピー済み ✓" : "リンクをコピー"}
                        </button>
                        <button
                          onClick={() => handleDelete([f.key])}
                          disabled={deletingKeys.has(f.key)}
                          className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400
                            px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          {deletingKeys.has(f.key) ? "削除中…" : "削除"}
                        </button>
                      </div>
                    </div>

                    {/* ── Inline preview player ── */}
                    {previewKey === f.key && (
                      <div className="ml-12 animate-in fade-in slide-in-from-top-1 duration-200">
                        <audio
                          controls
                          autoPlay
                          src={f.publicUrl}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
