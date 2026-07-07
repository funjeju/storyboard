"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  subscribeToQrCodes,
  createQrCode,
  updateQrCode,
  deleteQrCode,
  type CloudQrCode,
} from "@/lib/firestoreHelpers";

const P = "#7C3AED";
const PINK = "#EC4899";

// 주소 앞에 프로토콜이 없으면 https:// 보정
const normUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);

// URL → QR data URL 생성 (qrcode 동적 import)
async function makeQrDataUrl(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, { width: 600, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } });
}

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_").slice(0, 40) || "qrcode";

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 히스토리 카드 (각 카드가 자체적으로 QR 이미지를 생성)
function QrHistoryCard({
  qr, onEdit, onDelete,
}: {
  qr: CloudQrCode;
  onEdit: (q: CloudQrCode) => void;
  onDelete: (q: CloudQrCode) => void;
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let alive = true;
    makeQrDataUrl(qr.url).then(u => { if (alive) setDataUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [qr.url]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `QR_${safeName(qr.name)}.png`;
    a.click();
  };

  return (
    <div style={{ background: "white", borderRadius: 18, padding: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #EEF0F5", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ width: 96, height: 96, flexShrink: 0, borderRadius: 12, background: "#F8F9FC", border: "1px solid #EEF0F5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {dataUrl
            ? <img src={dataUrl} alt={qr.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 11, color: "#9CA3AF" }}>...</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{qr.name}</div>
          <a href={qr.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", fontSize: 12, color: "#2563EB", textDecoration: "none", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={qr.url}
          >{qr.url}</a>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>🕑 {fmtDate(qr.createdAt)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={download} disabled={!dataUrl}
          style={{ flex: 1, padding: "9px", background: dataUrl ? "rgba(124,58,237,0.08)" : "#F3F4F6", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, color: dataUrl ? P : "#9CA3AF", cursor: dataUrl ? "pointer" : "default" }}>
          ⬇ 다운로드
        </button>
        <button onClick={() => onEdit(qr)}
          style={{ padding: "9px 14px", background: "#F3F4F6", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, color: "#374151", cursor: "pointer" }}>
          ✏️ 수정
        </button>
        <button onClick={() => onDelete(qr)}
          style={{ padding: "9px 14px", background: "#FEF2F2", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, color: "#DC2626", cursor: "pointer" }}>
          🗑 삭제
        </button>
      </div>
    </div>
  );
}

export default function QrGenerator() {
  const { user, signIn } = useAuth();

  const [qrs, setQrs] = useState<CloudQrCode[]>([]);

  // 생성 폼
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");   // 현재 미리보기가 가리키는 주소
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");     // 저장 실패 안내
  const [savedFlash, setSavedFlash] = useState(false); // 저장 성공 토스트

  // 수정 모달
  const [editTarget, setEditTarget] = useState<CloudQrCode | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // 삭제 확인
  const [delTarget, setDelTarget] = useState<CloudQrCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) { setQrs([]); return; }
    const unsub = subscribeToQrCodes(user.uid, setQrs);
    return unsub;
  }, [user]);

  const handleGenerate = async () => {
    if (!url.trim()) return;
    setGenerating(true);
    try {
      const full = normUrl(url);
      const dataUrl = await makeQrDataUrl(full);
      setPreview(dataUrl);
      setPreviewUrl(full);
    } catch { /* silent */ }
    setGenerating(false);
  };

  const downloadPreview = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = `QR_${safeName(name || previewUrl)}.png`;
    a.click();
  };

  const handleSave = async () => {
    if (!preview || !previewUrl) return;
    if (!user) { await signIn(); return; }
    setSaving(true);
    setSaveError("");
    try {
      await createQrCode({
        id: crypto.randomUUID(),
        uid: user.uid,
        creatorName: user.displayName ?? "익명",
        name: name.trim() || previewUrl,
        url: previewUrl,
        createdAt: Date.now(),
      });
      // 폼 초기화 + 성공 안내 + 이력으로 스크롤
      setName(""); setUrl(""); setPreview(""); setPreviewUrl("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      setTimeout(() => document.getElementById("qr-history")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e: unknown) {
      console.error("QR 저장 실패:", e);
      const code = (e as { code?: string })?.code ?? "";
      setSaveError(
        code.includes("permission")
          ? "저장 권한이 없습니다. Firestore 보안 규칙(qrCodes)이 배포되었는지 확인해 주세요."
          : "저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
    setSaving(false);
  };

  const openEdit = (q: CloudQrCode) => {
    setEditTarget(q);
    setEditName(q.name);
    setEditUrl(q.url);
  };

  const handleEdit = async () => {
    if (!editTarget || !editUrl.trim()) return;
    setEditSaving(true);
    try {
      await updateQrCode(editTarget.id, {
        name: editName.trim() || normUrl(editUrl),
        url: normUrl(editUrl),
      });
      setEditTarget(null);
    } catch { /* silent */ }
    setEditSaving(false);
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      await deleteQrCode(delTarget.id);
      setDelTarget(null);
    } catch { /* silent */ }
    setDeleting(false);
  };

  const canGenerate = url.trim().length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        input:focus { outline:none; border-color:${P}!important; }
        .qr-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
        @media (max-width:720px){ .qr-grid{ grid-template-columns:1fr; } .qr-main{ grid-template-columns:1fr!important; } }
      `}</style>

      {/* Nav */}
      <nav style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg,${P},${PINK})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "white", fontWeight: 800, boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}>✦</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>AI Studio</div>
              <div style={{ fontSize: 9, color: "#9CA3AF", letterSpacing: 2, fontWeight: 600 }}>CREATIVE TOOLKIT</div>
            </div>
          </Link>
          <div style={{ width: 1, height: 24, background: "#E5E7EB", margin: "0 4px" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: P, whiteSpace: "nowrap" }}>🔳 QR 코드 생성기</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <>
              <img src={user.photoURL ?? ""} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{user.displayName}</span>
            </>
          ) : (
            <button onClick={signIn} style={{ padding: "8px 18px", background: `linear-gradient(135deg,${P},${PINK})`, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "white", cursor: "pointer" }}>
              로그인
            </button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 28, animation: "fadeUp 0.4s ease both" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>🔳 QR 코드 생성기</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 8, lineHeight: 1.6 }}>
            웹 주소를 넣으면 QR 코드를 만들어드려요. 저장하면 이력으로 보관되고, 이름·주소 수정과 삭제도 가능합니다.
          </p>
        </div>

        {/* 생성 영역 */}
        <div className="qr-main" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, background: "white", borderRadius: 22, padding: 28, boxShadow: "0 2px 16px rgba(0,0,0,0.06)", border: "1px solid #EEF0F5", animation: "fadeUp 0.45s ease both" }}>
          {/* 입력 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>🔗 웹사이트 주소 *</label>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleGenerate(); }}
                placeholder="예: https://study.funjeju.com"
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 14, fontFamily: "inherit" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>🏷️ QR 이름 (선택)</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="예: 우리 반 학습 페이지"
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 14, fontFamily: "inherit" }}
              />
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 5 }}>비워두면 주소가 이름으로 사용됩니다.</div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              style={{ padding: "13px", background: canGenerate ? `linear-gradient(135deg,${P},${PINK})` : "#E5E7EB", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: canGenerate ? "white" : "#9CA3AF", cursor: canGenerate ? "pointer" : "default", boxShadow: canGenerate ? "0 4px 16px rgba(124,58,237,0.3)" : "none" }}
            >
              {generating ? "생성 중..." : "🔳 QR 코드 생성"}
            </button>
          </div>

          {/* 미리보기 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "#F8F9FC", borderRadius: 16, padding: 20, border: "1px dashed #D9DEEA" }}>
            <div style={{ width: 220, height: 220, borderRadius: 12, background: "white", border: "1px solid #EEF0F5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {preview
                ? <img src={preview} alt="QR 미리보기" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <span style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 20 }}>주소를 입력하고<br />생성 버튼을 눌러주세요</span>}
            </div>
            {preview && (
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button onClick={downloadPreview} style={{ flex: 1, padding: "10px", background: "white", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#374151", cursor: "pointer" }}>⬇ 다운로드</button>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "10px", background: `linear-gradient(135deg,${P},${PINK})`, border: "none", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer" }}>{saving ? "저장 중..." : "💾 저장"}</button>
              </div>
            )}
            {preview && !user && (
              <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>저장하려면 로그인이 필요해요</div>
            )}
            {savedFlash && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", textAlign: "center" }}>✓ 이력에 저장했어요</div>
            )}
            {saveError && (
              <div style={{ fontSize: 11, color: "#DC2626", textAlign: "center", lineHeight: 1.5 }}>{saveError}</div>
            )}
          </div>
        </div>

        {/* 히스토리 */}
        <div id="qr-history" style={{ marginTop: 40, scrollMarginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>📜 생성 이력</span>
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>{qrs.length}개</span>
          </div>

          {!user ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF", background: "white", borderRadius: 18, border: "1px solid #EEF0F5" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>로그인하면 생성한 QR 이력이 여기에 저장됩니다</div>
              <button onClick={signIn} style={{ marginTop: 16, padding: "10px 22px", background: `linear-gradient(135deg,${P},${PINK})`, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "white", cursor: "pointer" }}>로그인</button>
            </div>
          ) : qrs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF", background: "white", borderRadius: 18, border: "1px solid #EEF0F5" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔳</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>아직 저장된 QR 코드가 없어요</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>위에서 첫 QR 코드를 만들어보세요!</div>
            </div>
          ) : (
            <div className="qr-grid">
              {qrs.map(qr => (
                <QrHistoryCard key={qr.id} qr={qr} onEdit={openEdit} onDelete={setDelTarget} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 수정 모달 */}
      {editTarget && (
        <div onClick={() => setEditTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 22, padding: "34px 30px", width: "100%", maxWidth: 420, boxShadow: "0 24px 80px rgba(0,0,0,0.18)", animation: "fadeUp 0.25s ease both" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 22 }}>✏️ QR 코드 수정</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>🏷️ QR 이름</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 14, fontFamily: "inherit" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>🔗 연결된 주소</label>
                <input value={editUrl} onChange={e => setEditUrl(e.target.value)} style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #E5E7EB", borderRadius: 10, fontSize: 14, fontFamily: "inherit" }} />
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 5 }}>주소를 바꾸면 QR 코드도 자동으로 바뀝니다.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
              <button onClick={() => setEditTarget(null)} style={{ flex: 1, padding: "12px", background: "white", border: "1.5px solid #E5E7EB", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>취소</button>
              <button onClick={handleEdit} disabled={editSaving || !editUrl.trim()} style={{ flex: 2, padding: "12px", background: editUrl.trim() ? `linear-gradient(135deg,${P},${PINK})` : "#E5E7EB", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: editUrl.trim() ? "white" : "#9CA3AF", cursor: editUrl.trim() ? "pointer" : "default" }}>{editSaving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {delTarget && (
        <div onClick={() => setDelTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 22, padding: 32, width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 24px 80px rgba(0,0,0,0.18)", animation: "fadeUp 0.25s ease both" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 8 }}>이 QR 코드를 삭제할까요?</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 22 }}><strong style={{ color: "#374151" }}>{delTarget.name}</strong></div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDelTarget(null)} style={{ flex: 1, padding: "12px", background: "white", border: "1.5px solid #E5E7EB", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>취소</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: "12px", background: "#EF4444", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "white", cursor: "pointer" }}>{deleting ? "삭제 중..." : "삭제"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
